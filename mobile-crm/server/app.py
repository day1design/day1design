"""Isolated CRM development API. Never connects to production or sends mail."""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / 'runtime' / 'crm.sqlite3'
INBOX = ROOT / 'runtime' / 'inbox'
OTP_TTL, OTP_MAX_ATTEMPTS, OTP_WINDOW, SESSION_TTL = 300, 5, 900, 86400
SCHEMA = '''
CREATE TABLE IF NOT EXISTS tenants(id TEXT PRIMARY KEY, name TEXT NOT NULL, suspended INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), email TEXT NOT NULL UNIQUE COLLATE NOCASE, role TEXT NOT NULL CHECK(role IN ('owner','staff')), active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS customers(id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', region TEXT NOT NULL DEFAULT '', budget INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'new', assignee_id TEXT REFERENCES users(id), version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS appointments(id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), customer_id TEXT NOT NULL REFERENCES customers(id), kind TEXT NOT NULL CHECK(kind IN ('visit','measurement')), starts_at TEXT NOT NULL, location TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'scheduled', version INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS consultations(id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), customer_id TEXT NOT NULL REFERENCES customers(id), result TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS contracts(id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), customer_id TEXT NOT NULL REFERENCES customers(id), amount INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'signed', signed_at TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id));
CREATE TABLE IF NOT EXISTS otp_requests(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), email TEXT NOT NULL, code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, used_at INTEGER, created_at INTEGER NOT NULL, request_ip TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS otp_rate(email TEXT NOT NULL, request_ip TEXT NOT NULL, window_start INTEGER NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(email,request_ip));
CREATE TABLE IF NOT EXISTS otp_cooldown(email TEXT PRIMARY KEY, requested_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, tenant_id TEXT NOT NULL, actor_id TEXT NOT NULL, customer_id TEXT NOT NULL, action TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_cursor ON customers(tenant_id,id);
CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_requests(email,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rate_email ON otp_rate(email,window_start);
CREATE INDEX IF NOT EXISTS idx_rate_ip ON otp_rate(request_ip,window_start);
CREATE INDEX IF NOT EXISTS idx_appointments_customer ON appointments(tenant_id,customer_id,id);
CREATE INDEX IF NOT EXISTS idx_consultations_customer ON consultations(tenant_id,customer_id,id);
CREATE INDEX IF NOT EXISTS idx_contracts_customer ON contracts(tenant_id,customer_id,id);
'''


def now():
    return int(time.time())


def iso():
    return datetime.now(timezone.utc).isoformat()


def connect(path=None):
    path = Path(path or os.environ.get('CRM_DB', str(DB_PATH)))
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    db.executescript(SCHEMA)
    return db


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def otp_digest(db, email, code):
    key_path = Path(db.execute('PRAGMA database_list').fetchone()[2]).with_suffix('.otp-key')
    try:
        with key_path.open('xb') as f:
            f.write(secrets.token_bytes(32))
    except FileExistsError:
        pass
    return hmac.new(key_path.read_bytes(), (email+'\0'+code).encode(), hashlib.sha256).hexdigest()


class ApiError(Exception):
    def __init__(self, status, message, details=None):
        self.status, self.message, self.details = status, message, details


def string(data, key, limit=500, required=False):
    value = data.get(key, '')
    if not isinstance(value, str) or len(value) > limit or (required and not value.strip()):
        raise ApiError(400, 'invalid '+key)
    return value.strip()


def integer(data, key, minimum=0, maximum=10**12):
    value = data.get(key)
    if type(value) is not int or not minimum <= value <= maximum:
        raise ApiError(400, 'invalid '+key)
    return value


def email_value(data):
    email = string(data, 'email', 254, True).lower()
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
        raise ApiError(400, 'invalid email')
    return email


def timestamp(data, key):
    value = string(data, key, 40, True)
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if parsed.tzinfo is None:
            raise ValueError()
    except ValueError:
        raise ApiError(400, 'timezone required for '+key)
    return parsed.astimezone(timezone.utc).isoformat()


def issue_otp(db, email, ip):
    t = now()
    for column, value in [('email', email), ('request_ip', ip)]:
        count = db.execute(f'SELECT COALESCE(SUM(count),0) FROM otp_rate WHERE {column}=? AND window_start>?', (value, t-OTP_WINDOW)).fetchone()[0]
        if count >= 5:
            raise ApiError(429, 'too many requests')
    rate = db.execute('SELECT * FROM otp_rate WHERE email=? AND request_ip=?', (email, ip)).fetchone()
    # Rate records are written for unknown identities too, preventing account enumeration.
    latest = db.execute('SELECT MAX(requested_at) FROM otp_cooldown WHERE email=?', (email,)).fetchone()[0]
    if latest is not None and latest > t-60:
        raise ApiError(429, 'retry later')
    if not rate or rate['window_start'] <= t-OTP_WINDOW:
        db.execute('INSERT OR REPLACE INTO otp_rate VALUES (?,?,?,1)', (email, ip, t))
    else:
        db.execute('UPDATE otp_rate SET count=count+1 WHERE email=? AND request_ip=?', (email, ip))
    db.execute('INSERT OR REPLACE INTO otp_cooldown VALUES (?,?)', (email, t))
    user = db.execute('SELECT u.* FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.email=? COLLATE NOCASE AND u.active=1 AND t.suspended=0', (email,)).fetchone()
    if user:
        code = f'{secrets.randbelow(1000000):06d}'
        db.execute('UPDATE otp_requests SET used_at=? WHERE user_id=? AND used_at IS NULL', (t, user['id']))
        ident = secrets.token_hex(16)
        db.execute('INSERT INTO otp_requests VALUES (?,?,?,?,?,0,NULL,?,?)', (ident, user['id'], email, otp_digest(db, email, code), t+OTP_TTL, t, ip))
        inbox = Path(os.environ.get('CRM_INBOX', str(INBOX)))
        inbox.mkdir(parents=True, exist_ok=True)
        (inbox / (ident+'.json')).write_text(json.dumps({'to':email, 'code':code, 'expires_at':t+OTP_TTL}), encoding='utf-8')
    return {'requested':True, 'expires_in':OTP_TTL}


class Handler(BaseHTTPRequestHandler):
    server_version = 'MobileCRM/0.1'

    def log_message(self, *args):
        pass

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(body)

    def body(self):
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if size < 0 or size > 65536:
                raise ApiError(413, 'request too large')
            data = json.loads(self.rfile.read(size) or b'{}')
            if not isinstance(data, dict):
                raise ValueError()
            return data
        except (ValueError, UnicodeError):
            raise ApiError(400, 'invalid JSON object')

    def token(self):
        value = self.headers.get('Authorization', '')
        return value[7:].strip() if value.lower().startswith('bearer ') else ''

    def auth(self, db):
        token = self.token()
        user = db.execute('SELECT u.*,t.name tenant_name,t.suspended FROM sessions s JOIN users u ON u.id=s.user_id JOIN tenants t ON t.id=u.tenant_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1', (digest(token), now())).fetchone() if token else None
        if not user:
            raise ApiError(401, 'unauthorized')
        if user['suspended']:
            raise ApiError(403, 'tenant suspended')
        return user

    def do_GET(self):
        self.dispatch()

    def do_PATCH(self):
        self.dispatch()

    def do_POST(self):
        self.dispatch()

    def dispatch(self):
        db = connect()
        try:
            data = self.body() if self.command in ('POST', 'PATCH') else {}
            db.execute('BEGIN IMMEDIATE' if self.command != 'GET' else 'BEGIN')
            status, payload = self.route(db, data)
            db.commit()
        except ApiError as error:
            db.rollback()
            status, payload = error.status, {'error':error.message, 'message':error.message}
            if error.details is not None:
                payload['details'] = error.details
        except sqlite3.IntegrityError:
            db.rollback()
            status, payload = 400, {'error':'invalid relationship or duplicate record'}
        except sqlite3.OperationalError:
            db.rollback()
            status, payload = 503, {'error':'storage unavailable; retry'}
        finally:
            db.close()
        self.send_json(status, payload)

    def route(self, db, data):
        path = urlparse(self.path).path
        if path == '/api/mobile' or path.startswith('/api/mobile/'):
            path = path[len('/api/mobile'):] or '/'
        if path == '/health' and self.command == 'GET':
            return 200, {'ok':True, 'environment':'isolated-development'}
        if path == '/auth/request-otp' and self.command == 'POST':
            return 200, issue_otp(db, email_value(data), self.client_address[0])
        if path == '/auth/verify-otp' and self.command == 'POST':
            return 200, self.verify(db, data)
        if path == '/auth/logout' and self.command == 'POST':
            db.execute('DELETE FROM sessions WHERE token_hash=?', (digest(self.token()),))
            return 200, {'logged_out':True}
        user = self.auth(db)
        if self.command != 'GET' and user['role'] != 'owner':
            raise ApiError(403, 'owner role required')
        if path == '/me' and self.command == 'GET':
            brand = 'day1design' if user['tenant_id'] == 'day1' else 'tenant'
            return 200, {'id':user['id'], 'email':user['email'], 'role':user['role'], 'tenant':{'id':user['tenant_id'], 'name':user['tenant_name']}, 'branding':{'brand':brand, 'logo':brand}}
        if path == '/members' and self.command == 'GET':
            rows = db.execute('SELECT id,email,role FROM users WHERE tenant_id=? AND active=1 ORDER BY id LIMIT 100', (user['tenant_id'],)).fetchall()
            return 200, {'members':[dict(row) for row in rows]}
        if path == '/customers' and self.command == 'GET':
            return 200, self.list_customers(db, user)
        match = re.fullmatch(r'/customers/([A-Za-z0-9_-]{1,80})', path)
        if match and self.command in ('GET', 'PATCH'):
            customer = self.customer(db, user, match[1])
            if self.command == 'PATCH':
                self.patch_customer(db, user, customer, data)
            return 200, self.detail(db, user, match[1])
        if path in ('/appointments', '/consultations', '/contracts') and self.command == 'POST':
            return 201, self.create_record(db, user, path[1:], data)
        raise ApiError(404, 'not found')

    def verify(self, db, data):
        email, code, t = email_value(data), string(data, 'code', 6, True), now()
        row = db.execute('SELECT r.*,u.active,t.suspended FROM otp_requests r JOIN users u ON u.id=r.user_id JOIN tenants t ON t.id=u.tenant_id WHERE r.email=? AND r.used_at IS NULL ORDER BY r.created_at DESC LIMIT 1', (email,)).fetchone()
        if not row or row['expires_at'] <= t or row['attempts'] >= OTP_MAX_ATTEMPTS:
            raise ApiError(401, 'invalid or expired code')
        db.execute('UPDATE otp_requests SET attempts=attempts+1 WHERE id=?', (row['id'],))
        if not hmac.compare_digest(row['code_hash'], otp_digest(db, email, code)) or row['suspended'] or not row['active']:
            db.commit()
            raise ApiError(401, 'invalid or expired code')
        db.execute('UPDATE otp_requests SET used_at=? WHERE id=?', (t, row['id']))
        token = secrets.token_urlsafe(32)
        db.execute('INSERT INTO sessions VALUES (?,?,?,?)', (digest(token), row['user_id'], t+SESSION_TTL, t))
        return {'token':token, 'expires_in':SESSION_TTL}

    def customer(self, db, user, ident):
        row = db.execute('SELECT * FROM customers WHERE id=? AND tenant_id=?', (ident, user['tenant_id'])).fetchone()
        if not row:
            raise ApiError(404, 'customer not found')
        return row

    def detail(self, db, user, ident):
        result = dict(self.customer(db, user, ident))
        result['history_has_more'] = {}
        for table in ('appointments', 'consultations', 'contracts'):
            rows = db.execute(f'SELECT * FROM {table} WHERE tenant_id=? AND customer_id=? ORDER BY id LIMIT 101', (user['tenant_id'], ident)).fetchall()
            result[table] = [dict(row) for row in rows[:100]]
            result['history_has_more'][table] = len(rows) > 100
        return result

    def list_customers(self, db, user):
        query = parse_qs(urlparse(self.path).query)
        cursor = query.get('cursor', [''])[0]
        q = query.get('q', [''])[0].lower()
        if len(cursor) > 80 or len(q) > 100:
            raise ApiError(400, 'invalid query')
        # Bound scanned rows too: search filters this cursor window, then continues.
        rows = db.execute('SELECT * FROM customers WHERE tenant_id=? AND id>? ORDER BY id LIMIT 51', (user['tenant_id'], cursor)).fetchall()
        window = rows[:50]
        items = [dict(row) for row in window if not q or q in (row['name']+' '+row['phone']+' '+row['region']).lower()]
        return {'customers':items, 'next_cursor':window[-1]['id'] if len(rows)>50 else None}

    def check_version(self, customer, data):
        version = integer(data, 'version', 1)
        if version != customer['version']:
            raise ApiError(409, 'version conflict', {'current':dict(customer)})
        return version

    def audit(self, db, user, ident, action):
        db.execute('INSERT INTO audit(tenant_id,actor_id,customer_id,action,created_at) VALUES (?,?,?,?,?)', (user['tenant_id'], user['id'], ident, action, iso()))

    def patch_customer(self, db, user, customer, data):
        version = self.check_version(customer, data)
        keys = {'name','phone','email','region','budget','status','assignee_id'}
        if set(data)-keys-{'version'}:
            raise ApiError(400, 'unknown field')
        values = {}
        for key in keys & set(data):
            if key == 'budget':
                values[key] = integer(data, key)
            elif key == 'assignee_id':
                ident = data[key]
                if ident is not None and (not isinstance(ident,str) or not db.execute('SELECT 1 FROM users WHERE id=? AND tenant_id=? AND active=1', (ident, user['tenant_id'])).fetchone()):
                    raise ApiError(400, 'invalid assignee')
                values[key] = ident
            else:
                values[key] = string(data, key, 500, key == 'name')
        if not values:
            raise ApiError(400, 'no editable fields')
        sets = ','.join(key+'=?' for key in values)
        db.execute(f'UPDATE customers SET {sets},version=version+1 WHERE id=? AND tenant_id=? AND version=?', (*values.values(), customer['id'], user['tenant_id'], version))
        self.audit(db, user, customer['id'], 'customer.updated')

    def create_record(self, db, user, table, data):
        customer = self.customer(db, user, string(data, 'customer_id', 80, True))
        version = self.check_version(customer, data)
        record = {'id':secrets.token_hex(12), 'tenant_id':user['tenant_id'], 'customer_id':customer['id']}
        if table == 'appointments':
            kind = string(data, 'kind', 20, True)
            if kind not in ('visit','measurement'):
                raise ApiError(400, 'invalid kind')
            record.update(kind=kind, starts_at=timestamp(data, 'starts_at'), location=string(data, 'location', 200, True), address=string(data, 'address', 500, True))
        elif table == 'consultations':
            record.update(result=string(data, 'result', 5000, True), created_by=user['id'], created_at=iso())
        else:
            status = string(data, 'status', 30, True)
            if status not in ('draft','signed','cancelled'):
                raise ApiError(400, 'invalid status')
            record.update(amount=integer(data, 'amount'), status=status, signed_at=timestamp(data, 'signed_at'), created_by=user['id'])
        columns = ','.join(record)
        db.execute(f'INSERT INTO {table}({columns}) VALUES ({",".join("?" for _ in record)})', tuple(record.values()))
        db.execute('UPDATE customers SET version=version+1 WHERE id=? AND tenant_id=? AND version=?', (customer['id'],user['tenant_id'],version))
        self.audit(db, user, customer['id'], table+'.created')
        return {'id':record['id'], 'version':version+1}


def run(host='127.0.0.1', port=18791):
    ThreadingHTTPServer((host, port), Handler).serve_forever()


if __name__ == '__main__':
    run(port=int(os.environ.get('CRM_PORT','18791')))

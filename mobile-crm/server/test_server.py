from contextlib import closing
import concurrent.futures
import json
import os
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path
from unittest.mock import patch

import app
from seed import seed


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name)/'crm.sqlite3'
        self.inbox = Path(self.tmp.name)/'inbox'
        self.env = patch.dict(os.environ, {'CRM_DB':str(self.db),'CRM_INBOX':str(self.inbox)})
        self.env.start()
        seed(str(self.db))
        with closing(app.connect(self.db)) as db, db:
            db.execute("INSERT INTO tenants VALUES ('other','Other studio',0)")
            db.execute("INSERT INTO users VALUES ('other-owner','other','owner@other.local','owner',1)")
            db.execute("INSERT INTO customers(id,tenant_id,name,created_at) VALUES ('other-customer','other','Other fixture',?)", (app.iso(),))
        self.server = app.ThreadingHTTPServer(('127.0.0.1',0),app.Handler)
        self.thread = threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.env.stop()
        self.tmp.cleanup()

    def call(self, method, path, payload=None, token=None):
        conn = HTTPConnection(*self.server.server_address,timeout=5)
        headers = {'Content-Type':'application/json'}
        if token:
            headers['Authorization'] = 'Bearer '+token
        try:
            conn.request(method, '/api/mobile'+path, json.dumps(payload or {}), headers)
            response = conn.getresponse()
            return response.status, json.loads(response.read())
        finally:
            conn.close()

    def request_code(self,email='owner@day1.local'):
        before = set(self.inbox.glob('*.json'))
        self.assertEqual(self.call('POST','/auth/request-otp',{'email':email})[0],200)
        files = set(self.inbox.glob('*.json'))-before
        self.assertEqual(len(files),1)
        return json.loads(files.pop().read_text())['code']

    def login(self,email='owner@day1.local'):
        code = self.request_code(email)
        status, body = self.call('POST','/auth/verify-otp',{'email':email,'code':code})
        self.assertEqual(status,200)
        return body['token']

    def test_unknown_and_suspended_identity_generic_response(self):
        known = self.call('POST','/auth/request-otp',{'email':'owner@day1.local'})
        before = set(self.inbox.glob('*.json'))
        unknown = self.call('POST','/auth/request-otp',{'email':'unknown@example.local'})
        self.assertEqual(known,unknown)
        self.assertEqual(set(self.inbox.glob('*.json')),before)
        with closing(app.connect(self.db)) as db, db:
            db.execute("UPDATE tenants SET suspended=1 WHERE id='other'")
        self.assertEqual(self.call('POST','/auth/request-otp',{'email':'owner@other.local'}),known)
        self.assertEqual(set(self.inbox.glob('*.json')),before)

    def test_otp_attempt_limit_expiry_and_replay(self):
        code = self.request_code()
        bad = '999999' if code!='999999' else '888888'
        for _ in range(5):
            self.assertEqual(self.call('POST','/auth/verify-otp',{'email':'owner@day1.local','code':bad})[0],401)
        self.assertEqual(self.call('POST','/auth/verify-otp',{'email':'owner@day1.local','code':code})[0],401)
        staff = self.request_code('staff@day1.local')
        with closing(app.connect(self.db)) as db, db:
            db.execute("UPDATE otp_requests SET expires_at=0 WHERE email='staff@day1.local'")
        self.assertEqual(self.call('POST','/auth/verify-otp',{'email':'staff@day1.local','code':staff})[0],401)
        other = self.request_code('owner@other.local')
        args = {'email':'owner@other.local','code':other}
        self.assertEqual(self.call('POST','/auth/verify-otp',args)[0],200)
        self.assertEqual(self.call('POST','/auth/verify-otp',args)[0],401)

    def test_concurrent_otp_consumption_issues_one_session(self):
        code = self.request_code()
        def verify(_):
            return self.call('POST','/auth/verify-otp',{'email':'owner@day1.local','code':code})[0]
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            self.assertEqual(sorted(pool.map(verify,range(2))),[200,401])

    def test_rate_cooldown_and_latest_code(self):
        first = self.request_code()
        self.assertEqual(self.call('POST','/auth/request-otp',{'email':'owner@day1.local'})[0],429)
        with closing(app.connect(self.db)) as db, db:
            db.execute('UPDATE otp_cooldown SET requested_at=0')
        second = self.request_code()
        if second != first:
            self.assertEqual(self.call('POST','/auth/verify-otp',{'email':'owner@day1.local','code':first})[0],401)
        self.assertEqual(self.call('POST','/auth/verify-otp',{'email':'owner@day1.local','code':second})[0],200)
        for i in range(3):
            self.assertEqual(self.call('POST','/auth/request-otp',{'email':f'unknown{i}@test.local'})[0],200)
        self.assertEqual(self.call('POST','/auth/request-otp',{'email':'limit@test.local'})[0],429)

    def test_logout_suspension_and_session_expiry(self):
        token = self.login()
        self.assertEqual(self.call('GET','/me',token=token)[1]['branding']['logo'],'day1design')
        self.assertEqual(self.call('POST','/auth/logout',token=token)[0],200)
        self.assertEqual(self.call('GET','/me',token=token)[0],401)
        staff = self.login('staff@day1.local')
        with closing(app.connect(self.db)) as db, db:
            db.execute("UPDATE tenants SET suspended=1 WHERE id='day1'")
        self.assertEqual(self.call('GET','/customers',token=staff)[0],403)
        self.assertEqual(self.call('POST','/auth/logout',token=staff)[0],200)
        other = self.login('owner@other.local')
        with closing(app.connect(self.db)) as db, db:
            db.execute('UPDATE sessions SET expires_at=0')
        self.assertEqual(self.call('GET','/me',token=other)[0],401)

    def test_cross_tenant_records_and_assignee_are_rejected(self):
        token = self.login()
        self.assertEqual(self.call('GET','/customers/other-customer',token=token)[0],404)
        self.assertEqual(self.call('PATCH','/customers/customer-1',{'version':1,'assignee_id':'other-owner'},token)[0],400)
        for route in ('appointments','consultations','contracts'):
            self.assertEqual(self.call('POST','/'+route,{'customer_id':'other-customer','version':1},token)[0],404)
        self.assertNotIn('other-owner',json.dumps(self.call('GET','/members',token=token)[1]))

    def test_staff_cannot_mutate_and_can_logout(self):
        token = self.login('staff@day1.local')
        self.assertEqual(self.call('GET','/customers/customer-1',token=token)[0],200)
        for route in ('appointments','consultations','contracts'):
            self.assertEqual(self.call('POST','/'+route,{'customer_id':'customer-1','version':1},token)[0],403)
        self.assertEqual(self.call('PATCH','/customers/customer-1',{'version':1,'name':'changed'},token)[0],403)
        self.assertEqual(self.call('POST','/auth/logout',token=token)[0],200)
        self.assertEqual(self.call('GET','/me',token=token)[0],401)

    def test_customer_cas_and_malformed_version(self):
        token = self.login()
        self.assertEqual(self.call('PATCH','/customers/customer-1',{'version':'abc','status':'contacted'},token)[0],400)
        update = {'version':1,'status':'contacted'}
        self.assertEqual(self.call('PATCH','/customers/customer-1',update,token)[0],200)
        status, body = self.call('PATCH','/customers/customer-1',update,token)
        self.assertEqual(status,409)
        self.assertEqual(body['details']['current']['version'],2)
        self.assertEqual(self.call('POST','/customers/customer-1',update,token)[0],404)

    def test_subresources_are_atomic_versioned_and_read_back(self):
        token = self.login()
        payloads = [('/appointments',{'kind':'visit','starts_at':'2026-09-10T10:00:00+09:00','location':'Pangyo','address':'Fixture address'}),('/appointments',{'kind':'measurement','starts_at':'2026-09-11T10:00:00+09:00','location':'Site','address':'Fixture site'}),('/consultations',{'result':'QA consultation result'}),('/contracts',{'amount':1000,'status':'signed','signed_at':'2026-09-08T12:00:00+09:00'})]
        for version,(route,values) in enumerate(payloads,1):
            payload = {'customer_id':'customer-1','version':version,**values}
            self.assertEqual(self.call('POST',route,payload,token)[0],201)
            self.assertEqual(self.call('POST',route,payload,token)[0],409)
        _, detail = self.call('GET','/customers/customer-1',token=token)
        self.assertEqual(detail['version'],5)
        self.assertEqual(len(detail['appointments']),2)
        self.assertEqual(len(detail['consultations']),1)
        self.assertEqual(len(detail['contracts']),1)
        with closing(app.connect(self.db)) as db, db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM audit').fetchone()[0],4)

    def test_invalid_datetime_and_negative_money_do_not_write(self):
        token = self.login()
        bad = {'customer_id':'customer-1','version':1,'kind':'visit','starts_at':'2026-09-10','location':'office','address':'fixture'}
        self.assertEqual(self.call('POST','/appointments',bad,token)[0],400)
        self.assertEqual(self.call('POST','/contracts',{'customer_id':'customer-1','version':1,'amount':-1,'status':'signed','signed_at':'2026-09-10T10:00:00Z'},token)[0],400)
        self.assertEqual(self.call('GET','/customers/customer-1',token=token)[1]['version'],1)

    def test_bounded_cursor_and_malformed_body(self):
        token = self.login()
        with closing(app.connect(self.db)) as db, db:
            for i in range(65):
                db.execute('INSERT INTO customers(id,tenant_id,name,created_at) VALUES (?,?,?,?)',(f'fixture-{i:03d}','day1',f'Fixture {i}',app.iso()))
        _, first = self.call('GET','/customers',token=token)
        self.assertEqual(len(first['customers']),50)
        _, second = self.call('GET','/customers?cursor='+first['next_cursor'],token=token)
        self.assertEqual(len(second['customers']),16)
        self.assertIsNone(second['next_cursor'])
        self.assertEqual(self.call('POST','/auth/request-otp',['not-an-object'])[0],400)


    def test_concurrent_customer_write_has_one_winner(self):
        token = self.login()
        def save(index):
            return self.call('PATCH','/customers/customer-1',{'version':1,'name':f'Fixture {index}'},token)[0]
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            self.assertEqual(sorted(pool.map(save,range(2))),[200,409])
        self.assertEqual(self.call('GET','/customers/customer-1',token=token)[1]['version'],2)

    def test_large_body_and_foreign_tenant_branding(self):
        self.assertEqual(self.call('POST','/auth/request-otp',{'email':'x'*66000})[0],413)
        token = self.login('owner@other.local')
        me = self.call('GET','/me',token=token)[1]
        self.assertEqual(me['tenant']['id'],'other')
        self.assertEqual(me['branding']['logo'],'tenant')

    def test_seed_refuses_existing_data(self):
        with self.assertRaises(SystemExit):
            seed(str(self.db))
        with closing(app.connect(self.db)) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM tenants').fetchone()[0],2)


if __name__ == '__main__':
    unittest.main()

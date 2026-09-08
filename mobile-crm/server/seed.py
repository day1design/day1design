"""Create explicit local fixtures; never overwrite an existing database by default."""
import argparse
from contextlib import closing
from app import connect, iso


def seed(path, reset=False):
    with closing(connect(path)) as db, db:
        db.execute('BEGIN IMMEDIATE')
        if not reset and any(db.execute(f'SELECT 1 FROM {table} LIMIT 1').fetchone() for table in ('tenants','users','customers')):
            raise SystemExit('refusing nonempty database; pass --reset for the local fixture')
        for table in ('audit','otp_cooldown','sessions','otp_requests','otp_rate','contracts','consultations','appointments','customers','users','tenants'):
            db.execute('DELETE FROM '+table)
        db.execute("INSERT INTO tenants VALUES ('day1','데이원디자인',0)")
        db.execute("INSERT INTO users VALUES ('owner-day1','day1','owner@day1.local','owner',1)")
        db.execute("INSERT INTO users VALUES ('staff-day1','day1','staff@day1.local','staff',1)")
        db.execute("INSERT INTO customers VALUES ('customer-1','day1','개발 고객 A','010-0000-0000','customer@example.local','강남',50000000,'new','staff-day1',1,?)", (iso(),))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--db', required=True)
    parser.add_argument('--reset', action='store_true')
    args = parser.parse_args()
    seed(args.db, args.reset)

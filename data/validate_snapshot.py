"""Validate the migration-source CSV snapshot; no external connections required.

Run from anywhere with: python data/validate_snapshot.py
"""
from pathlib import Path
from collections import Counter
import csv
import json

base = Path(__file__).resolve().parent
with (base / 'wine_purchase_rows.csv').open(encoding='utf-8-sig', newline='') as f:
    rows = list(csv.DictReader(f))
with (base / 'receipt_totals.csv').open(encoding='utf-8-sig', newline='') as f:
    receipts = list(csv.DictReader(f))
manifest = json.loads((base / 'source_manifest.json').read_text(encoding='utf-8'))
wanted = manifest['validation']
assert len(rows) == wanted['wine_purchase_rows'], 'wrong number of wine purchase rows'
assert len({r['wine_name'] for r in rows}) == wanted['distinct_wine_names'], 'wrong number of wine names'
assert len(receipts) == wanted['receipt_count'], 'wrong number of receipts'
assert len(rows) == wanted['bottle_quantity_total'], 'each current source row represents one bottle'
assert sum(int(x['paid_amount_krw']) for x in receipts) == wanted['paid_total_krw']
for receipt in receipts:
    date = receipt['purchased_on']
    total = int(receipt['gross_items_amount_krw']) + int(receipt['bundle_amount_krw']) - int(receipt['discount_amount_krw'])
    assert total == int(receipt['paid_amount_krw']), f'receipt reconciliation failed {date}'
    assert total == wanted['paid_by_date_krw'][date], f'wrong receipt total {date}'
    item_prices = sum(int(r['unit_price_krw']) for r in rows if r['purchased_on'] == date and r['unit_price_krw'])
    assert item_prices == int(receipt['gross_items_amount_krw']), f'wrong individual sum {date}'
assert sum(int(x['bundle_amount_krw']) for x in receipts) == wanted['bundle_price_krw']
assert sum(int(x['discount_amount_krw']) for x in receipts) == wanted['bulk_discount_unallocated_krw']
missing_price_names = {r['wine_name'] for r in rows if not r['unit_price_krw']}
assert missing_price_names == set(wanted['bundle_wine_names']), 'bundle amount should not be allocated'
assert all(r['vivino_url'].startswith('https://www.vivino.com/') for r in rows), 'missing Vivino link'
print('PASS: 10 distinct wines; 12 purchase/bottle rows; 2 receipts; paid 293,900 KRW')
print('PASS: 39,900 KRW bundle unallocated; 18,000 KRW receipt discount preserved')

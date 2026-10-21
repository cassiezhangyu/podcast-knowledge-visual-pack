#!/usr/bin/env python3
"""复用正式送审的预检核验，在实际导出前拦截缺项和画后补签。"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from prepare_independent_review import asset, check_preflight

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--scene', required=True)
parser.add_argument('--preflight', required=True)
args = parser.parse_args()
plan = json.loads(Path(args.preflight).read_text())
inputs = plan.get('inputs', {})
args.page_id = plan.get('page_id')
args.role = plan.get('role')
args.revalidate_existing = False
refs = [asset(item['path']) for kind in ['positive', 'negative'] for item in inputs[kind]]
check_preflight(args.preflight, args, refs, asset(inputs['content']['path']), asset(inputs['taste']['path']), asset(inputs['tokens']['path']))
print(json.dumps({'status': 'pass', 'page_id': args.page_id}, ensure_ascii=False))

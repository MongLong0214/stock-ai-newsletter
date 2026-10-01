"""Read-only diagnostics of already-selected KIS ledgers. No fitting or policy selection."""
from __future__ import annotations

import collections
import datetime
import hashlib
import json
import pathlib
import statistics
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE.parent))
from outcome_diagnostic import diagnose_five_session_outcomes

CALENDAR = pathlib.Path('/tmp/stock-research-fresh-mature-20260930/input/metadata.json')
PRICES = CALENDAR.parent / 'prices.ndjson'
STATIC_LEDGER = pathlib.Path('/tmp/composite-score-research-20260930/monthly-adaptive-study/outer-ledger.json')
LEDGERS = {
    ('L0', 'inner'): ROOT / 'kis-l0-inner-ledger.json',
    ('L0', 'outer'): ROOT / 'kis-l0-outer-ledger.json',
    ('L5', 'inner'): ROOT / 'kis-inner-ledger.json',
    ('L5', 'outer'): ROOT / 'kis-outer-ledger.json',
}


def read_json(path):
    return json.loads(path.read_text())


def sha(path):
    with path.open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def inventory(ledgers):
    paths = {CALENDAR, PRICES, STATIC_LEDGER, HERE.parent / 'outcome_diagnostic.py'}
    for ledger in ledgers.values():
        paths.update(pathlib.Path(p) for p in ledger['sourceHashes'])
    paths.update(LEDGERS.values())
    # Model and prediction cache files are hashed, never imported or semantically read.
    for child in ROOT.iterdir():
        if not child.name.startswith('kis-'):
            continue
        if child.is_dir() and child.name.endswith(('-models', '-calibrators', '-predictions', '-training-configs')):
            paths.update(p for p in child.rglob('*') if p.is_file())
        elif child.is_file() and child.suffix in ('.json', '.py'):
            paths.add(child)
    paths = {p.resolve() for p in paths}
    return {str(p): {'sha256': sha(p), 'bytes': p.stat().st_size} for p in sorted(paths)}


def rate(values):
    known = [v for v in values if v is not None]
    return {'known': len(known), 'unknown': len(values) - len(known),
            'count': sum(known), 'rate': statistics.mean(known) if known else None}


def numeric(values):
    known = [v for v in values if v is not None]
    return {'known': len(known), 'unknown': len(values) - len(known),
            'mean': statistics.mean(known) if known else None,
            'median': statistics.median(known) if known else None,
            'minimum': min(known) if known else None,
            'maximum': max(known) if known else None}


def costs(record, bps):
    return record['diagnostic']['costSensitivity'][(30, 60, 100).index(bps)]


def aggregate(records, dates, study, partition, policy, split):
    by_date = collections.Counter(r['signalDate'] for r in records)
    strict = [r for r in records if r['diagnostic']['strictAll5PositiveOhlcv']]
    raw = [r for r in records if r['diagnostic']['rawMarkStatus'] == 'known']
    unknown_reasons = collections.Counter(x['reason'] for r in records for x in r['diagnostic']['unknownReasons'])
    result = {'study': study, 'partition': partition, 'policy': policy, 'split': split,
              'signalDays': len(dates), 'signalFirst': dates[0], 'signalLast': dates[-1],
              'selectedSlots': len(records), 'expectedSlots': len(dates) * 3,
              'threePicksEverySignal': all(by_date[d] == 3 for d in dates),
              'rawKnown': len(raw), 'rawUnknown': len(records) - len(raw),
              'strictKnown': len(strict), 'strictUnknown': len(records) - len(strict),
              'unknownReasons': dict(unknown_reasons),
              'modelScopes': dict(collections.Counter(r['modelScope'] for r in records)),
              'rawTouch10': rate([r['diagnostic']['raw']['targetTouch10'] for r in records]),
              'rawD1Bullish': rate([r['diagnostic']['raw']['day1Bullish'] for r in records]),
              'rawGrossD5': numeric([r['diagnostic']['raw']['grossD5'] for r in records]),
              'rawFull5Mae': numeric([r['diagnostic']['raw']['full5Mae'] for r in records]),
              'strictTouch10': rate([r['diagnostic']['raw']['targetTouch10'] if r['diagnostic']['strictAll5PositiveOhlcv'] else None for r in records]),
              'strictFull5Mae': numeric([r['diagnostic']['raw']['full5Mae'] if r['diagnostic']['strictAll5PositiveOhlcv'] else None for r in records]),
              'sameBarAmbiguous': rate([r['diagnostic']['models']['targetStop']['sameDayAmbiguous'] for r in records]),
              'targetOnlyAfterEarlierStop': rate([r['targetOnlyAfterEarlierStop'] for r in records]),
              'targetBeforeStopConservative': rate([r['diagnostic']['models']['targetStop']['conservative']['exitReason'] == 'target' if r['diagnostic']['strictAll5PositiveOhlcv'] else None for r in records]),
              'targetBeforeStopOptimistic': rate([r['diagnostic']['models']['targetStop']['optimistic']['exitReason'] == 'target' if r['diagnostic']['strictAll5PositiveOhlcv'] else None for r in records]),
              'exitReasonsConservative': dict(collections.Counter(r['diagnostic']['models']['targetStop']['conservative']['exitReason'] for r in strict)),
              'exitReasonsOptimistic': dict(collections.Counter(r['diagnostic']['models']['targetStop']['optimistic']['exitReason'] for r in strict)),
              'costSensitivity': []}
    for bps in (30, 60, 100):
        row = {'roundTripBps': bps}
        for name, cohort in [('rawMark', records), ('strictD5', strict)]:
            row[name] = {
                'netD5': numeric([costs(r, bps)['rawMark']['netD5'] for r in cohort]),
                'anyNegative': rate([costs(r, bps)['rawMark']['allNegativeD5'] for r in cohort]),
                'lossAtLeast5Pct': rate([costs(r, bps)['rawMark']['lossAtLeast5Pct'] for r in cohort]),
                'touchAndPositiveD5Net': rate([costs(r, bps)['rawMark']['targetTouchAndD5NetPositive'] for r in cohort]),
                'touchAndNonnegativeD5Net': rate([costs(r, bps)['rawMark']['targetTouchAndD5NetNonnegative'] for r in cohort]),
            }
        row['targetOnly'] = {
            'netReturn': numeric([costs(r, bps)['targetOnly']['netReturn'] for r in records]),
            'anyNegative': rate([costs(r, bps)['targetOnly']['allNegative'] for r in records]),
            'lossAtLeast5Pct': rate([costs(r, bps)['targetOnly']['lossAtLeast5Pct'] for r in records]),
        }
        row['targetStop'] = {}
        for bound, suffix, negative, loss in [('conservative', 'Lower', 'Possible', 'Possible'), ('optimistic', 'Upper', 'Certain', 'Certain')]:
            row['targetStop'][bound] = {
                'netReturn': numeric([costs(r, bps)['targetStop']['netReturn' + suffix] for r in records]),
                'anyNegative': rate([costs(r, bps)['targetStop']['allNegative' + negative] for r in records]),
                'lossAtLeast5Pct': rate([costs(r, bps)['targetStop']['lossAtLeast5Pct' + loss] for r in records]),
            }
        result['costSensitivity'].append(row)
    return result


def comparison_rows(records):
    differences = []
    counters = collections.Counter()
    numeric_differences = collections.defaultdict(list)
    for record in records:
        old = record['originalOutcome']
        diag = record['diagnostic']
        at30 = costs(record, 30)['rawMark']
        checks = {'rawCoverage': (old['rawMarkValid'], diag['rawMarkStatus'] == 'known'),
                  'strictCoverage': (old['strictLabelValid'], diag['strictAll5PositiveOhlcv'])}
        if old['rawMarkValid'] and diag['rawMarkStatus'] == 'known':
            checks.update({'touch10': (old['touch'], diag['raw']['targetTouch10']),
                           'day1Bullish': (old['entryBullish'], diag['raw']['day1Bullish']),
                           'anyNegativeD5At30bps': (old['net5d'] < 0, at30['allNegativeD5']),
                           'L5At30bps': (old['net5d'] <= -.05, at30['lossAtLeast5Pct']),
                           'touchAndPositiveD5At30bps': (old['touchAndPositiveD5Net'], at30['targetTouchAndD5NetPositive'])})
            for name, new_value in [('gross5d', diag['raw']['grossD5']), ('net5d', at30['netD5']), ('mae', diag['raw']['full5Mae'])]:
                delta = new_value - old[name]
                if delta != 0:
                    numeric_differences[name].append(abs(delta))
                    counters[name + 'NonzeroFloatRepresentationDelta'] += 1
                if abs(delta) > 1e-12:
                    checks[name + 'Beyond1e-12'] = (old[name], new_value)
        for field, (before, after) in checks.items():
            counters[field + 'Comparisons'] += 1
            if before != after:
                counters[field + 'Differences'] += 1
                differences.append({'study': record['study'], 'partition': record['partition'],
                                    'policy': record['policy'], 'signalDate': record['signalDate'],
                                    'symbol': record['symbol'], 'field': field,
                                    'originalFrozen': before, 'newDiagnostic': after})
    return {'counts': dict(counters), 'numericRepresentationDelta': {
        k: {'count': len(v), 'maxAbsolute': max(v)} for k, v in numeric_differences.items()},
        'booleanOrSubstantiveDifferences': differences,
        'frozenFitLabelsRewritten': 0,
        'note': 'Decimal source-number comparisons are diagnostic only; original float labels and all models remain frozen.'}


def pct(value):
    return '?' if value is None else f'{100 * value:.2f}%'


def make_table(rows, heading):
    lines = [heading, '', 'All rates below use the strict complete five-positive-OHLCV cohort. Unknown slots are retained separately.',
             'Costs are fixed total round-trip 30 bps. Target exits are hypothetical price proxies, not observed orders.', '',
             '| Study | Split | Policy | Known/slots | +10% touch | D5 any loss | D5 L5 | Full5 MAE mean | D5 mean | Target-only mean / loss | Target-stop mean lower..upper | Target-stop loss lower..upper | Ambiguous | Earlier stop then later target |',
             '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
    for row in rows:
        c = row['costSensitivity'][0]
        d = c['strictD5']
        t = c['targetOnly']
        lo, hi = c['targetStop']['conservative'], c['targetStop']['optimistic']
        lines.append('| ' + ' | '.join([
            row['study'], row['split'], row['policy'], f"{row['strictKnown']}/{row['selectedSlots']}",
            pct(row['strictTouch10']['rate']), pct(d['anyNegative']['rate']), pct(d['lossAtLeast5Pct']['rate']),
            pct(row['strictFull5Mae']['mean']), pct(d['netD5']['mean']),
            pct(t['netReturn']['mean']) + ' / ' + pct(t['anyNegative']['rate']),
            pct(lo['netReturn']['mean']) + '..' + pct(hi['netReturn']['mean']),
            pct(lo['anyNegative']['rate']) + '..' + pct(hi['anyNegative']['rate']),
            str(row['sameBarAmbiguous']['count']), str(row['targetOnlyAfterEarlierStop']['count']),
        ]) + ' |')
    return '\n'.join(lines)


def main():
    ledger_read_hashes = {str(path.resolve()): sha(path) for path in LEDGERS.values()}
    ledgers = {key: read_json(path) for key, path in LEDGERS.items()}
    before = inventory(ledgers)
    assert all(before[path]['sha256'] == digest for path, digest in ledger_read_hashes.items())
    for ledger in ledgers.values():
        for path, declared in ledger['sourceHashes'].items():
            assert before[str(pathlib.Path(path).resolve())]['sha256'] == declared, ('declared_source_hash_mismatch', path)
    calendar = read_json(CALENDAR)['tradingDays']
    assert calendar == sorted(set(calendar))
    positions = {day: i for i, day in enumerate(calendar)}
    outer_dates = [d['signalDate'] for d in ledgers[('L0', 'outer')]['policies'][0]['days']]
    assert len(outer_dates) == 181 and outer_dates[-1] == '2026-09-18'
    original = outer_dates[:-1]
    splits = {'originalTrain80': original[:80], 'validationReused30': original[85:115],
              'testReused60': original[120:180], 'allOriginal180': original,
              'fresh1': outer_dates[-1:], 'allOriginalPlusFresh181': outer_dates,
              'recent55IncludingFresh': outer_dates[-55:]}
    records = []
    groups = {}
    calendar_assertions = 0
    day_assertions = 0
    bar_source_counts = collections.Counter()
    for (study, partition), ledger in ledgers.items():
        assert ledger['actualPublishedHistory'] is False
        policy_names = [p['name'] for p in ledger['policies']]
        assert len(set(policy_names)) == len(policy_names)
        for policy in ledger['policies']:
            policy_records = []
            dates = [day['signalDate'] for day in policy['days']]
            assert dates == sorted(set(dates))
            if partition == 'outer':
                assert dates == outer_dates
            else:
                assert len(dates) == 235
            for day in policy['days']:
                signal = day['signalDate']
                i = positions[signal]
                expected = calendar[i + 1:i + 6]
                assert len(expected) == 5
                assert day['recommendationDateExpected'] == expected[0]
                assert day['expectedD5date'] == expected[-1]
                assert day['pickedCount'] == len(day['picks']) == 3
                assert len({p['symbol'] for p in day['picks']}) == 3
                assert sorted(p['selectionRank'] for p in day['picks']) == [1, 2, 3]
                day_assertions += 1
                for pick in day['picks']:
                    assert pick['date'] == signal
                    assert pick['recommendationDate'] == expected[0]
                    assert pick['expectedD5date'] == expected[-1]
                    bars = pick['dailyBars']
                    assert len(bars) == 5
                    assert [bar['date'] for bar in bars] == expected
                    assert [bar['session'] for bar in bars] == list(range(1, 6))
                    for bar in bars:
                        assert bar.get('missing') is True or bar['source'] == 'kis'
                        bar_source_counts['missing' if bar.get('missing') else bar['source']] += 1
                    if not bars[0].get('missing'):
                        assert pick['D1open'] == bars[0]['open']
                    diagnostic = diagnose_five_session_outcomes(expected, {bar['date']: bar for bar in bars}, entry_open=pick['D1open'])
                    assert diagnostic['sessionDates'] == expected
                    model = diagnostic['models']
                    after_prior_stop = None
                    if diagnostic['strictAll5PositiveOhlcv']:
                        stop = model['targetStop']['conservative']
                        target = model['targetOnly']
                        after_prior_stop = (target['exitReason'] == 'target'
                                            and stop['exitReason'] in ('stop', 'stop_gap')
                                            and stop['exitDate'] < target['exitDate'])
                    record = {'study': study, 'partition': partition, 'policy': policy['name'],
                              'signalDate': signal, 'recommendationDate': expected[0], 'D5Date': expected[-1],
                              'symbol': pick['symbol'], 'currentMasterName': pick['currentMasterName'],
                              'selectionRank': pick['selectionRank'], 'signals': pick['signals'],
                              'modelScope': day['modelScope'], 'calibratorId': day.get('calibratorId'),
                              'originalOutcome': pick['outcome'], 'diagnostic': diagnostic,
                              'targetOnlyAfterEarlierStop': after_prior_stop}
                    records.append(record)
                    policy_records.append(record)
                    calendar_assertions += 1
            groups[(study, partition, policy['name'])] = policy_records
    rows = []
    for (study, partition, policy), rr in groups.items():
        if partition == 'inner':
            ds = sorted({r['signalDate'] for r in rr})[-80:]
            active = [r for r in rr if r['signalDate'] in set(ds)]
            if policy in ('winnerA', 'winnerB'):
                assert all(r['modelScope'] and r['modelScope'].endswith('prefix150') for r in active)
            rows.append(aggregate(active, ds, study, partition, policy, 'activeInner80'))
        else:
            for split, ds in splits.items():
                ds_set = set(ds)
                rows.append(aggregate([r for r in rr if r['signalDate'] in ds_set], ds, study, partition, policy, split))
    before_paths = set(before)
    after = inventory(ledgers)
    changes = [p for p in before_paths | set(after) if before.get(p) != after.get(p)]
    assert not changes, ('source_cache_model_ledger_changed', changes)
    definitions = {
        'notLiveHistory': 'Already-selected research ledgers; no actual published recommendation history or real orders.',
        'units': 'Returns and rates are fractions in JSON; markdown multiplies fractions by 100.',
        'entryAndHorizon': 'Actual next calendar session D1 open after signalDate; exact next five sessions including D1, close of D5.',
        'rawTouch': 'Any observed high D1..D5 >= entry open * 1.10. Raw marks require five valid OHLC bars; positive volume is a separate stricter cohort.',
        'D1Bullish': 'D1 close > D1 open; previous-close return is a different quantity.',
        'D5AnyNegativeL0': 'D5 close / D1 open - 1 - total round-trip cost < 0.',
        'D5L5': 'D5 close / D1 open - 1 - total round-trip cost <= -0.05, inclusive.',
        'MAE': 'Minimum of all five observed lows / entry open - 1; includes candles after any hypothetical exit, not pre-exit drawdown.',
        'targetOnly': 'Hypothetical capped +10% target exit at first target-reaching session, otherwise D5 close. Requires all five positive valid OHLCV bars. This favorable proxy assumes a target can fill; actual fills unknown.',
        'targetStop': 'Hypothetical first passage +10% target / -5% stop, otherwise D5 close. Session open precedes daily high/low. Opening target gaps are capped at +10%; opening stop gaps exit proxy at actual open and can lose more than 5%.',
        'ambiguity': 'If open lies between barriers and same daily bar touches both, conservative assumes stop first; optimistic assumes target first. Both bounds preserved; no fabricated intraday ordering.',
        'targetBeforeStop': 'Conservative/optimistic count of target-stop proxy ending at target / strict known cohort. Same-bar ambiguity contributes only to optimistic target count.',
        'targetOnlyAfterEarlierStop': 'Target-only proxy reaches target on a strictly later calendar date than first conservative stop/stop_gap. Same-day ambiguous cases are reported separately, not counted as proven prior stop.',
        'costs': '30, 60, 100 bps fixed TOTAL round-trip costs, gross return minus bps/10000 exactly once. Hypothetical price proxies, not realized profits, fill simulation, or orders.',
        'unknown': 'Incomplete/invalid OHLC, nonpositive or invalid volume, or invalid entry => proxy unknown, never zero or false. Valid zero-volume OHLC can retain raw observational marks.',
        'splitReuse': 'Original 180 split: diagnostic TRAIN80, 5 purge, reused validation30, 5 purge, reused test60. These are not pristine unseen tests and do not choose any new model. Inner80 are last active dates of original causal235-day lifecycle. Fresh1 is one 2026-09-18 signal, not statistical validation.',
        'otherLimits': 'Current master survivorship, adjusted/vintage price issues, repeated tickers and overlapping five-day horizons remain. No confidence or causal outperformance claim; no independent duplicate-baseline pooling across L0/L5.',
        'scope': 'No feature fit, model fit, tuning, variant creation, selector execution, product source, UI, copy, delivery, DB, frozen-label or archive changes. New NAVER 2023-24 actual labels were not read.',
    }
    report = {'generatedAtUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'schemaVersion': 'kis-fixed-selection-economic-diagnostic-v1', 'definitions': definitions,
              'splitCalendar': {k: {'days': len(v), 'first': v[0], 'last': v[-1], 'dates': v} for k, v in splits.items()},
              'calendarBinding': {'selectedObservations': calendar_assertions, 'dayAssertions': day_assertions,
                                  'selectedBarRecords': sum(bar_source_counts.values()), 'barSourceCounts': dict(bar_source_counts),
                                  'nextFiveCalendarDifferences': 0, 'entryOpenDifferences': 0, 'D5DateDifferences': 0},
              'integrity': {'filesHashedBeforeAfter': len(before), 'bytesHashedEachPass': sum(v['bytes'] for v in before.values()),
                            'changedFiles': changes, 'declaredSourceHashDifferences': 0,
                            'ledgerLoadHashDifferences': 0,
                            'before': before, 'after': after},
              'frozenLabelComparison': comparison_rows(records), 'rows': rows,
              'absentInnerPolicy': 'boundedEventComposite has no inner ledger; inner selections were not synthesized.',
              'operations': {'featureFits': 0, 'modelFits': 0, 'variantsCreated': 0, 'frozenLabelWrites': 0,
                             'productSourceWrites': 0, 'uiWrites': 0, 'wordingWrites': 0,
                             'newNaver2023_24ActualLabelReads': 0}}
    (HERE / 'comparison.json').write_text(json.dumps(report, ensure_ascii=False, separators=(',', ':'), allow_nan=False))
    (HERE / 'selected-tickers-and-outcomes.json').write_text(json.dumps({'scope': definitions['notLiveHistory'], 'selectedObservations': len(records), 'records': records}, ensure_ascii=False, separators=(',', ':'), allow_nan=False))
    compact = {k: v for k, v in report.items() if k not in ('integrity', 'rows')}
    compact['integrity'] = {k: v for k, v in report['integrity'].items() if k not in ('before', 'after')}
    compact['rows'] = rows
    (HERE / 'compact-summary.json').write_text(json.dumps(compact, ensure_ascii=False, separators=(',', ':'), allow_nan=False))
    table = make_table([r for r in rows if r['split'] in ('activeInner80', 'allOriginal180', 'testReused60', 'recent55IncludingFresh', 'fresh1')], '# Fixed KIS selection: price outcome and hypothetical exit diagnostic')
    table += '\n\n' + '\n\n'.join(f'**{k}**: {v}' for k, v in definitions.items())
    table += '\n\n' + json.dumps(compact['calendarBinding'], ensure_ascii=False) + '\n\n' + json.dumps(compact['integrity'], ensure_ascii=False) + '\n'
    (HERE / 'COMPARISON.md').write_text(table)
    print(json.dumps({'rows': len(rows), 'selectedObservations': len(records), 'calendar': report['calendarBinding'],
                      'integrity': compact['integrity'], 'floatComparison': report['frozenLabelComparison']['counts'],
                      'outputs': ['comparison.json', 'compact-summary.json', 'selected-tickers-and-outcomes.json', 'COMPARISON.md']}, ensure_ascii=False))


if __name__ == '__main__':
    main()

"""Offline fixed-membership 50-input exporter; deliberately no labels or models."""
from __future__ import annotations
import ast,collections,datetime,hashlib,json,pathlib,math,random,subprocess,time
from extra_features import ObservedSetupFeatures, ORIGINAL_FEATURE_NAMES, EXTRA_FEATURE_NAMES, EXTRA_FEATURE_SPECS, original_inputs18, finite

BASE=pathlib.Path('/tmp/composite-score-research-20260930')
OUT=pathlib.Path('/tmp/composite-score-experimental-20260930')
FRESH=pathlib.Path('/tmp/stock-research-fresh-mature-20260930')
RAW=FRESH/'input/prices.ndjson'
META=FRESH/'input/metadata.json'
REPO=pathlib.Path('/Users/isaac/WebstormProjects/stock-ai-newsletter')
GATE_PATHS=[BASE/'earlier-training/earlier-runtime-eligibility.ndjson',BASE/'horizon-runtime-eligibility.ndjson',BASE/'calibration-extra/runtime-eligibility.ndjson']
CONTEXT_PATHS=[BASE/'earlier-training/earlier-context.ndjson',BASE/'technical-context.ndjson',BASE/'calibration-extra/context.ndjson']
INPUT_PATHS=[RAW,META,*GATE_PATHS,*CONTEXT_PATHS,BASE/'earlier-training/earlier-wide.ndjson',BASE/'current-signals.ndjson',pathlib.Path('/tmp/upside-scored.ndjson'),FRESH/'scored.ndjson',BASE/'calibration-extra/wide.ndjson',BASE/'event-composite-study/event-research.py',BASE/'raw-composite-study/raw-research.py']
SIGNAL_KEYS=['trend_score','momentum_score','volume_score','volatility_score','pattern_score','sentiment_score','overall_score']

def sha(path):
    with pathlib.Path(path).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()

def save_json(path,value):
    with path.open('x') as f:json.dump(value,f,ensure_ascii=False,indent=2,allow_nan=False);f.write('\n')

def items(path):
    with pathlib.Path(path).open() as f:
        for line in f:
            if line.strip():yield json.loads(line)

def reference_atoms_function():
    """Extract only existing observed assignments; never execute loaders/label code."""
    event=(BASE/'event-composite-study/event-research.py').read_text()
    tree=ast.parse(event)
    replacement_node=next(n for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='replacements' for t in n.targets))
    replacements=ast.literal_eval(replacement_node.value)
    original=(BASE/'raw-composite-study/raw-research.py').read_text()
    point_node=next(n for n in ast.parse(original).body if isinstance(n,ast.FunctionDef) and n.name=='point')
    source=ast.get_source_segment(original,point_node)
    for a,b in replacements.items():source=source.replace(a,b)
    converted=ast.parse(source).body[0]
    converted.body=[n for n in converted.body if isinstance(n,ast.Assign) and all(isinstance(t,ast.Name) and t.id in {'f','symbol','c','close_return','atoms'} for t in n.targets)]
    converted.body.append(ast.Return(value=ast.Name(id='atoms',ctx=ast.Load())))
    context={};scope={'context':context,'finite':finite}
    module=ast.fix_missing_locations(ast.Module(body=[converted],type_ignores=[]))
    exec(compile(module,'frozen-original-observed-assignments-only','exec'),scope)
    return scope['point'],context,ast.unparse(module)


def run_oracles():
    calendar=[f'{i:04}' for i in range(130)]
    bars={d:{'symbol':'oracle','trade_date':d,'source':'kis','open':98,'high':102,'low':98,'close':100,'volume':100+i} for i,d in enumerate(calendar)}
    extractor=ObservedSetupFeatures(calendar,bars)
    actual=dict(zip(EXTRA_FEATURE_NAMES,extractor.at(calendar[-1])))
    expected={**{f'return{n}Percent':0.0 for n in [1,2,3,10,40,120]},
        'closeSma5DistancePercent':0.0,'sma5ToSma20Ratio':1.0,'return20ExcludingRecent5Percent':0.0,
        **{f'distanceFromPriorHigh{n}Percent':(100/102-1)*100 for n in [5,10,60,120]},
        'atr5ToAtr20Ratio':1.0,'returnVolatility5To20Ratio':None,'normalizedRange5To20Ratio':1.0,
        'todayTrToPrior20MeanRatio':1.0,'volumeMean3ToPrevious20Ratio':228/216.5,
        'volumeMean5ToPrevious20Ratio':227/214.5,'todayVolumeToPrior5MeanRatio':229/226,
        'bullishVolumeShare5':1.0,'upCloseVolumeShare10':0.0,'todayTurnoverToPrior20MeanRatio':229/218.5,
        'logAverageTurnover20':math.log(100*219.5),'clvMean3':0.0,'clvMean5':0.0,
        'candleBodyMean3Percent':(100/98-1)*100,'candleBodyMean5Percent':(100/98-1)*100,
        'upperWickMean5':0.5,'positiveCloseDays5':0.0,'priorHigh20AgeSessions':1,
        'drawdownFromPrior60ClosePeakPercent':0.0}
    for name,value in expected.items():
        assert actual[name] is None if value is None else actual[name] is not None and math.isclose(actual[name],value,rel_tol=1e-11,abs_tol=1e-11),(name,actual[name],value)
    changed={d:dict(r) for d,r in bars.items()};changed[calendar[-1]]['high']=10000
    x=dict(zip(EXTRA_FEATURE_NAMES,ObservedSetupFeatures(calendar,changed).at(calendar[-1])))
    for n in [5,10,60,120]:assert x[f'distanceFromPriorHigh{n}Percent']==actual[f'distanceFromPriorHigh{n}Percent']
    assert x['priorHigh20AgeSessions']==1
    changed[calendar[-2]]['high']=20000;changed[calendar[-3]]['high']=20000
    x=dict(zip(EXTRA_FEATURE_NAMES,ObservedSetupFeatures(calendar,changed).at(calendar[-1])))
    assert x['priorHigh20AgeSessions']==1,'Most recent tied prior high must win'
    missing={d:dict(r) for d,r in bars.items()};missing.pop(calendar[-2])
    x=dict(zip(EXTRA_FEATURE_NAMES,ObservedSetupFeatures(calendar,missing).at(calendar[-1])))
    assert x['return1Percent'] is None and x['atr5ToAtr20Ratio'] is None and x['volumeMean3ToPrevious20Ratio'] is None
    assert all(v is None for v in ObservedSetupFeatures(calendar[:1],{calendar[0]:bars[calendar[0]]}).at(calendar[0]))
    flat={d:{**r,'open':100,'high':100,'low':100} for d,r in bars.items()}
    x=dict(zip(EXTRA_FEATURE_NAMES,ObservedSetupFeatures(calendar,flat).at(calendar[-1])))
    assert x['clvMean3'] is None and x['clvMean5'] is None and x['upperWickMean5'] is None
    assert x['atr5ToAtr20Ratio'] is None and x['normalizedRange5To20Ratio'] is None
    return {'handCalculatedFeatureChecks':len(expected),'priorHighExcludesCurrent':True,'latestPriorHighTie':True,'missingAndShortHistoryPreserveNull':True,'flatRangePreservesNull':True}


def main():
    started=time.time();stamp=datetime.datetime.now(datetime.timezone.utc).isoformat()
    if (OUT/'extra-features.ndjson').exists():raise FileExistsError('Existing export will not be silently replaced')
    before={str(p):{'sha256':sha(p),'bytes':p.stat().st_size,'mtimeNs':p.stat().st_mtime_ns} for p in INPUT_PATHS}
    print('SOURCE_HASHED',len(before),flush=True)
    meta=json.loads(META.read_text());calendar=meta['tradingDays'];date_index={d:i for i,d in enumerate(calendar)}
    gate={};groups={}
    for group,path in zip(['earlier235','outer181','extra7'],GATE_PATHS):
        for x in items(path):
            d=x['date'];assert d not in gate
            symbols=x.get('runtimeEligibleSymbols',x.get('symbols'));assert len(symbols)==len(set(symbols))
            gate[d]=set(symbols);groups[d]=group
    dates=sorted(gate);assert len(dates)==423 and sum(map(len,gate.values()))==509015
    assert dates==calendar[date_index[dates[0]]:date_index[dates[-1]]+1]
    print('GATE',len(dates),sum(map(len,gate.values())),flush=True)
    context={}
    for path in CONTEXT_PATHS:
        for x in items(path):
            if x['symbol'] in gate.get(x['date'],set()):
                key=(x['date'],x['symbol']);assert key not in context;context[key]=x['context']
    print('CONTEXT',len(context),flush=True)
    reference,ref_context,ref_source=reference_atoms_function()
    by_symbol=collections.defaultdict(list);seen=set();original_diffs=[];missing_context=0
    def accept(d,p,signals,source):
        nonlocal missing_context
        symbol=p['symbol']
        if symbol not in gate[d]:return
        key=(d,symbol);assert key not in seen;seen.add(key)
        feature=p['feature'];assert feature['simDate']==d and feature['symbol']==symbol
        c=context.pop(key,None);missing_context+=c is None
        atom=original_inputs18(feature,c)
        values=tuple((c or {}).get(k) for k in ['chaikinMoneyFlow21','distanceFromPriorHigh20Percent','bollingerWidth20Percent','return5Percent','return20Percent','return60Percent','closeLocation','upperWickRatio','benchmarkReturn20Percent','breadthAboveSma20'])
        ref_context[key]=values
        ref=reference(d,p,signals,source);ref_context.pop(key)
        ref=[v if finite(v) else None for v in ref]
        if atom!=ref:original_diffs.append([d,symbol,atom,ref]);raise AssertionError(original_diffs[-1])
        assert list(signals)==SIGNAL_KEYS and all(isinstance(signals[k],int) and 0<=signals[k]<=100 for k in SIGNAL_KEYS)
        by_symbol[symbol].append((d,atom,signals,source,tuple(feature[k] for k in ['open','high','low','close','volume'])))
    for p in items(BASE/'earlier-training/earlier-wide.ndjson'):accept(p['date'],p,p['signals'],'earlier-training')
    score_iter=iter(items(BASE/'current-signals.ndjson'))
    for path,source in [(pathlib.Path('/tmp/upside-scored.ndjson'),'primary'),(FRESH/'scored.ndjson','fresh-mature')]:
        for d,points in items(path):
            for p in points:
                scores=next(score_iter);assert scores['date']==d and scores['symbol']==p['symbol'] and scores['provenance']==source
                accept(d,p,scores['signals'],source)
    assert next(score_iter,None) is None
    for p in items(BASE/'calibration-extra/wide.ndjson'):accept(p['date'],p,p['signals'],'calibration-extra')
    by_date=collections.defaultdict(set)
    for d,symbol in seen:by_date[d].add(symbol)
    assert len(seen)==509015 and all(by_date[d]==gate[d] for d in dates)
    del by_date
    assert not context
    print('ORIGINAL_INPUTS',len(seen),'diffs',len(original_diffs),flush=True)
    del seen,context
    raw={};chunks=0;raw_rows=0;duplicate_chunks=0;duplicate_rows=0;conflicts=[]
    for symbol,rows in items(RAW):
        chunks+=1;duplicate_chunks+=symbol in raw
        prior=raw.setdefault(symbol,{})
        for r in rows:
            raw_rows+=1;assert r['symbol']==symbol
            if r['trade_date'] in prior:
                duplicate_rows+=1
                if prior[r['trade_date']]!=r:conflicts.append([symbol,r['trade_date']])
            prior[r['trade_date']]=r
    if conflicts:raise AssertionError({'conflictingRawRows':len(conflicts),'first':conflicts[:10]})
    print('RAW',chunks,raw_rows,'duplicates',duplicate_chunks,duplicate_rows,flush=True)
    source_head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=REPO,text=True).strip()
    specs={'schemaVersion':'experimental-observed-50-v1-20260930','originalFeatureNames':ORIGINAL_FEATURE_NAMES,'extraFeatureNames':EXTRA_FEATURE_NAMES,'featureNames':ORIGINAL_FEATURE_NAMES+EXTRA_FEATURE_NAMES,
        'extraFeatureSpecs':EXTRA_FEATURE_SPECS,'sharedRules':{'asOf':'All windows end at signal date; prior means exclude specified latest candles. Calendar aligned, never compress missing sessions.','priceValidity':'KIS only; positive finite internally consistent OHLC. Missing OHLC invalidates the candle.','volumeValidity':'Finite nonnegative volume; observed zero is retained, absent/negative volume is null.','missing':'Any missing observation in a stated window => null; undefined ratio/flat CLV/wick => null. Never history-fill zero.','wilderHistory':'Latest max320 calendar-bar prefix ending at asOf, then valid contiguous OHLC suffix; ATR seeds recomputed inside that bounded suffix. All other windows are <=121 bars with direct sums, so >320 old prefix changes cannot affect them.','labels':'No labels, model training, score fitting or stock selection performed.','eligibility':'Frozen actual TS memberships, independent of feature completeness and future outcomes.'},'originalInputAuthority':{'eventSourcePath':str(BASE/'event-composite-study/event-research.py'),'observedReferenceAssignments':ref_source}}
    save_json(OUT/'featurespec.json',specs)
    oracle=run_oracles();audit_cases=[];older_prefix_cases=[];missing=collections.Counter();per_date=collections.Counter();output_hash=hashlib.sha256();row_count=0;raw_current_diffs=[]
    chosen_symbols=[s for s in sorted(by_symbol) if len(by_symbol[s])>=5 and any(date_index[p[0]]>=320 for p in by_symbol[s])][:100];assert len(chosen_symbols)==100
    output=OUT/'extra-features.ndjson'
    with output.open('xb') as f:
        for ix,symbol in enumerate(sorted(by_symbol)):
            rr=raw.get(symbol,{})
            extractor=ObservedSetupFeatures(calendar,rr)
            points=sorted(by_symbol[symbol],key=lambda p:p[0])
            if symbol in chosen_symbols:
                # Vary as-of dates across symbols; force a later appended bar as well as altered suffix.
                p=points[(chosen_symbols.index(symbol)*17)%len(points)];d=p[0];t=date_index[d]
                changed={date:dict(bar) for date,bar in rr.items()}
                for date in calendar[t+1:]:
                    changed[date]={'symbol':symbol,'trade_date':date,'source':'kis','open':500000,'high':900000,'low':1000,'close':800000,'volume':123456789}
                extended=calendar+['2099-01-01'];changed['2099-01-01']={'symbol':symbol,'trade_date':'2099-01-01','source':'kis','open':2,'high':9,'low':1,'close':8,'volume':987654321}
                original=extractor.at(d);mutated=ObservedSetupFeatures(extended,changed).at(d)
                assert original==mutated,(symbol,d,'Future suffix changed past setup features')
                audit_cases.append({'symbol':symbol,'asOf':d,'alteredExistingFutureSessions':len(calendar)-t-1,'appendedFutureSession':'2099-01-01','same32ObservedSetupInputs':True,'original18AtomsCopiedFromFrozenObservedSource':True,'pastInputSha256':hashlib.sha256(json.dumps(p[1]+original,separators=(',',':'),allow_nan=False).encode()).hexdigest()})
                old_point=next(p for p in reversed(points) if date_index[p[0]]>=320)
                old_date=old_point[0];old_t=date_index[old_date];cutoff=old_t-319
                altered_prefix={date:dict(bar) for date,bar in rr.items()}
                for date in calendar[:cutoff]:
                    altered_prefix[date]={'symbol':symbol,'trade_date':date,'source':'kis','open':500000000000,'high':900000000000,'low':1000000000,'close':800000000000,'volume':999999999999}
                actual_old=extractor.at(old_date);mutated_old=ObservedSetupFeatures(calendar,altered_prefix).at(old_date)
                assert actual_old==mutated_old,(symbol,old_date,'Older-than-320 prefix changed bounded setup features')
                older_prefix_cases.append({'symbol':symbol,'asOf':old_date,'firstAllowedCalendarBar':calendar[cutoff],'changedOlderCalendarBars':cutoff,'same32ObservedSetupInputs':True})
            for d,atoms,signals,source,source_ohlcv in points:
                t=date_index[d];r=rr.get(d)
                if r is None or r.get('source')!='kis' or tuple(r.get(k) for k in ['open','high','low','close','volume'])!=source_ohlcv:
                    raw_current_diffs.append([d,symbol]);raise AssertionError(('Current OHLCV source mismatch',d,symbol))
                extra=extractor.at(d)
                for name,value in zip(EXTRA_FEATURE_NAMES,extra):missing[name]+=value is None
                item={'date':d,'symbol':symbol,'sourceGroup':source,'runtimeEligible':True,'originalInputs18':atoms,'extraInputs32':extra,'sourceSignals':signals}
                line=(json.dumps(item,ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n').encode()
                f.write(line);output_hash.update(line);row_count+=1;per_date[d]+=1
            if (ix+1)%400==0:print('EXPORTED_SYMBOLS',ix+1,'rows',row_count,flush=True)
    assert row_count==509015 and row_count<=1000000 and all(per_date[d]==len(gate[d]) for d in dates)
    assert len(audit_cases)==100 and len(older_prefix_cases)==100
    after={str(p):sha(p) for p in INPUT_PATHS}
    assert all(v['sha256']==after[p] and v['bytes']==pathlib.Path(p).stat().st_size for p,v in before.items()),'Read-only source changed during export'
    audit={'original18AtomDifferences':len(original_diffs),'membershipDifferences':0,'currentOhlcvDifferences':len(raw_current_diffs),'sourceSignalCategoryMutationCount':0,'futureSuffixMutationWitnesses':audit_cases,'futureSuffixMutationWitnessCount':100,'futureSuffix32InputDifferences':0,'olderThan320PrefixMutationWitnesses':older_prefix_cases,'olderThan320PrefixMutationWitnessCount':100,'olderThan320Prefix32InputDifferences':0,'oracle':oracle,'extraMissingCounts':dict(missing),'sourceInputsUnchanged':True,'databaseCalls':0,'modelFits':0,'labelCalculations':0,'stockSelections':0}
    save_json(OUT/'audit.json',audit)
    manifest={'schemaVersion':specs['schemaVersion'],'startedAtUTC':stamp,'completedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'elapsedSeconds':time.time()-started,'repositoryHeadReadOnly':source_head,'signalDates':dates,'signalDateCount':len(dates),'rows':row_count,'symbols':len(by_symbol),'eligibleCountByDate':dict(sorted(per_date.items())),'groups':{group:{'dates':sum(groups[d]==group for d in dates),'memberships':sum(len(gate[d]) for d in dates if groups[d]==group)} for group in sorted(set(groups.values()))},'calendar':{'path':str(META),'first':calendar[0],'last':calendar[-1],'sessions':len(calendar),'sha256':hashlib.sha256(json.dumps(calendar,separators=(',',':')).encode()).hexdigest()},'raw':{'path':str(RAW),'chunks':chunks,'rows':raw_rows,'uniqueRows':sum(map(len,raw.values())),'duplicateSymbolChunks':duplicate_chunks,'duplicateDateRows':duplicate_rows,'conflictingDateRows':len(conflicts),'mergePolicy':'Merge symbol/date chunks; identical duplicates retained once; conflicts reject. Never replace a complete symbol history with an appended chunk.'},'originalContextMissingEligible':missing_context,'inputFiles':before,'module':{'path':str(OUT/'extra_features.py'),'sha256':sha(OUT/'extra_features.py')},'exporter':{'path':str(pathlib.Path(__file__)),'sha256':sha(__file__)},'outputs':{name:{'path':str(OUT/name),'sha256':sha(OUT/name),'bytes':(OUT/name).stat().st_size} for name in ['featurespec.json','extra-features.ndjson','audit.json']},'scope':'Frozen observed eligibility panel; current-master survivorship remains. No outcomes read for feature calculation, fitting, scoring or selecting.'}
    assert manifest['outputs']['extra-features.ndjson']['sha256']==output_hash.hexdigest()
    save_json(OUT/'manifest.json',manifest)
    print('DONE',json.dumps({'rows':row_count,'dates':len(dates),'symbols':len(by_symbol),'bytes':output.stat().st_size,'sha256':output_hash.hexdigest(),'seconds':manifest['elapsedSeconds'],'audit':{k:v for k,v in audit.items() if k not in ['futureSuffixMutationWitnesses','olderThan320PrefixMutationWitnesses','extraMissingCounts']}}),flush=True)

if __name__=='__main__':main()

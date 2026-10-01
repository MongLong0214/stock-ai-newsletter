import json,hashlib
from pathlib import Path
from decimal import Decimal
B=Path('/tmp/composite-score-experimental-20260930/source-bridge');root=Path('/tmp');report=[];files=[];before={}
for day,workflow in [('20260929','36484308881'),('20260930','36631489672')]:
 artifact=root/('stock-prepare-observed-'+day);sp=artifact/'stock-picks-snapshot.json';pp=artifact/'prepare-summary.json';lp=B/('actual-prepare-'+day+'-live-kis.json');files += [sp,pp,lp]
 for p in [sp,pp,lp]:before[str(p)]=hashlib.sha256(p.read_bytes()).hexdigest()
 snap=json.loads(sp.read_bytes());summary=json.loads(pp.read_bytes());live=json.loads(lp.read_bytes());prices={r['symbol']:r['rows'] for r in live['outputs']};target=summary['targetDate'];assert target==day[:4]+'-'+day[4:6]+'-'+day[6:]
 assert {p['symbol'] for p in snap['picks']}=={p['ticker'] for p in summary['picks']}==set(prices) and len(prices)==3
 assert all(c['query']['FID_COND_MRKT_DIV_CODE']=='J' and c['query']['FID_ORG_ADJ_PRC']=='0' for c in live['calls']) and live['priceCalls']==3 and live['blockedWrites']==0 and live['sourceClientSha256Before']==live['sourceClientSha256After']
 picks=[]
 for p in snap['picks']:
  rs=sorted(prices[p['symbol']],key=lambda r:r['date']);assert rs[0]['date']==target and rs[-1]['date']=='2026-09-30';assert len(rs)==(2 if day=='20260929' else 1)
  for r in rs:assert r['volume']>0 and 0<r['low']<=min(r['open'],r['close'])<=max(r['open'],r['close'])<=r['high']
  entry=Decimal(str(rs[0]['open']));ret=lambda v:float(Decimal(str(v))/entry-1)
  d1=ret(rs[0]['close']);latest=ret(rs[-1]['close']);mfe=ret(max(r['high'] for r in rs));low=ret(min(r['low'] for r in rs));high=max(r['high'] for r in rs)
  picks.append({'symbol':p['symbol'],'name':p['name'],'snapshotRankingValue':p['score'],'rankingValueIsDisplayedCompositeScore':False,'signalAtrPercent14':p['atrPercent14'],'entryDate':target,'entryOpen':int(entry),'observedSessions':len(rs),'D1bullish':rs[0]['close']>rs[0]['open'],'D1doji':rs[0]['close']==rs[0]['open'],'D1grossCloseReturn':d1,'D1hypotheticalNetAfter30bps':d1-.003,'latestObservedCloseDate':rs[-1]['date'],'latestGrossCloseReturn':latest,'latestHypotheticalNetAfter30bps':latest-.003,'observedIntradayMaxFromEntry':mfe,'observedIntradayMinFromEntry':low,'observedTouch10':high*100>=int(entry)*110,'fiveSessionMature':False,'fiveSessionFinalResult':None,'rawBars':rs})
 report.append({'recommendationDate':target,'prepareWorkflowRunId':workflow,'artifactGitSha':snap['gitSha'],'artifactStrategy':snap['strategy'],'artifactStrategyVersion':snap['strategyVersion'],'artifactSignalDate':snap['signalDate'],'artifactGeneratedAt':snap['generatedAt'],'liveObservedAt':live['observedAt'],'source':'KIS production helper, KRX J, adjusted0, raw stck_clpr','actualPrepareSelectionArtifact':True,'emailDeliveryProvenByTheseArtifacts':False,'separateFromResearchPaperPortfolios':True,'picks':picks,'D1bullishCount':sum(p['D1bullish'] for p in picks),'D1grossEqualWeightMean':sum(p['D1grossCloseReturn'] for p in picks)/3,'latestGrossEqualWeightMean':sum(p['latestGrossCloseReturn'] for p in picks)/3,'allFiveSessionResultsImmature':True})
after={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in files};assert before==after
out={'schema':'actual-prepare-observed-partial-session-results-v1','asOfKoreaDate':'2026-09-30','market':'KRX regular session, checked after15:30KST','priceApiCalls':6,'sourceHashesBefore':before,'sourceHashesAfter':after,'sourceBytesUnchanged':True,'newNaver2023_2024OutcomeReads':0,'costConvention':'Hypothetical round trip30bps subtracted from gross open-to-close mark; no actual fills or realized user PnL claimed','notFiveSessionFinalPerformance':True,'productOrDatabaseMutations':0,'days':report}
(B/'actual-prepare-20260929-30-partial-results.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
lines=['실제 prepare 선정 아티팩트의 9/30 KRX 장 마감 후 중간 관측이다. 발송 성공 자체는 이 아티팩트만으로 증명하지 않으며, 연구용 종목 리스트와 구분한다. 두 추천일 모두 5거래일 결과는 아직 미성숙이다.','', '| 추천일 | 종목 | D1 양봉 | 추천일 시가→종가 | 시가→9/30 종가 | 관측 고점 | 관측 저점 |','|---|---|---:|---:|---:|---:|---:|']
for d in report:
 for p in d['picks']:lines.append('| '+' | '.join([d['recommendationDate'],p['name']+' '+p['symbol'].split(':')[1],'예' if p['D1bullish'] else '아니오',*[f'{p[k]*100:+.3f}%' for k in ['D1grossCloseReturn','latestGrossCloseReturn','observedIntradayMaxFromEntry','observedIntradayMinFromEntry']]])+' |')
lines+=['','위 수익은 비용 전 가격 변화다. 가상 왕복비용30bps를 적용하면 각각0.30%p를 차감한다. 실제 주문·체결·손익이 아니다. 아티팩트의 score는 전략 순위값이며 화면의 종합점수로 해석하지 않았다.','', '9/29: lowVolatilityStable v2-2026-09-23, SHA277d64161f44e1e1b7ece2f7aaa10a7a14f2955b.','9/30: bullishTarget5d v3-2026-09-29, SHA87613f95379ca5f22393677dd7e1429f7085daa0. 현재 main의 전략과 오늘 오전 실행 전략을 혼동하지 않는다.']
(B/'actual-prepare-20260929-30-partial-results.md').write_text('\n'.join(lines)+'\n');print('\n'.join(lines))

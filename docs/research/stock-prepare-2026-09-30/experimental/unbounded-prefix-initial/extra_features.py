"""Causal observed feature extraction only; no labels, fitting or selection."""
from __future__ import annotations
import math
from collections import deque

ORIGINAL_FEATURE_NAMES = [
    'atrPercent14','volumeRatio20','chaikinMoneyFlow21','distanceFromPriorHigh20Percent',
    'bollingerWidth20Percent','signalCloseCloseReturnPercent','gapFromPreviousClosePercent',
    'signalIntradayReturnPercent','rsi14','sma20DistancePercent','sma60DistancePercent',
    'return5Percent','return20Percent','return60Percent','closeLocation','upperWickPercent',
    'kospiReturn20Percent','breadthAboveSma20Percent',
]
EXTRA_FEATURE_SPECS = [
    *[{'name':f'return{n}Percent','unit':'percent','definition':f'100*(C[t]/C[t-{n}]-1); complete {n+1}-session close window'} for n in [1,2,3,10,40,120]],
    {'name':'closeSma5DistancePercent','unit':'percent','definition':'100*(C[t]/mean(C[t-4:t])-1)'},
    {'name':'sma5ToSma20Ratio','unit':'ratio','definition':'mean(C[t-4:t])/mean(C[t-19:t])'},
    {'name':'return20ExcludingRecent5Percent','unit':'percent','definition':'100*(C[t-5]/C[t-20]-1); complete t-20..t-5 close window'},
    *[{'name':f'distanceFromPriorHigh{n}Percent','unit':'percent','definition':f'100*(C[t]/max(H[t-{n}:t-1])-1); current bar excluded'} for n in [5,10,60,120]],
    {'name':'atr5ToAtr20Ratio','unit':'ratio','definition':'Wilder ATR5/ATR20; first period TR mean seed, recursive update; reset on missing/invalid OHLC; TR at new contiguous segment start=H-L'},
    {'name':'returnVolatility5To20Ratio','unit':'ratio','definition':'sample SD of log(C[j]/C[j-1]), latest 5 returns/latest 20 returns; requires 21 contiguous closes; zero denominator => null'},
    {'name':'normalizedRange5To20Ratio','unit':'ratio','definition':'mean((H-L)/C), latest 5 candles/latest 20 candles; zero denominator => null'},
    {'name':'todayTrToPrior20MeanRatio','unit':'ratio','definition':'TR[t]/mean(TR[t-20:t-1]); every TR requires observed previous close'},
    {'name':'volumeMean3ToPrevious20Ratio','unit':'ratio','definition':'mean(V[t-2:t])/mean(V[t-22:t-3]); recent 3 excluded from prior 20'},
    {'name':'volumeMean5ToPrevious20Ratio','unit':'ratio','definition':'mean(V[t-4:t])/mean(V[t-24:t-5]); recent 5 excluded from prior 20'},
    {'name':'todayVolumeToPrior5MeanRatio','unit':'ratio','definition':'V[t]/mean(V[t-5:t-1])'},
    {'name':'bullishVolumeShare5','unit':'ratio_0_1','definition':'sum(V*I(C>O)), latest 5 candles / sum(V), same 5 candles'},
    {'name':'upCloseVolumeShare10','unit':'ratio_0_1','definition':'sum(V[j]*I(C[j]>C[j-1])), latest 10 candles / sum(V), same 10; requires 11 closes'},
    {'name':'todayTurnoverToPrior20MeanRatio','unit':'ratio','definition':'C[t]*V[t]/mean(C[j]*V[j]), j=t-20..t-1'},
    {'name':'logAverageTurnover20','unit':'natural_log_KRW','definition':'ln(mean(C[j]*V[j])), j=t-19..t; positive mean required'},
    *[{'name':f'clvMean{n}','unit':'ratio_minus1_1','definition':f'mean((2*C-L-H)/(H-L)), latest {n} candles; flat candle => null window'} for n in [3,5]],
    *[{'name':f'candleBodyMean{n}Percent','unit':'percent','definition':f'mean(100*(C/O-1)), latest {n} candles; signed body'} for n in [3,5]],
    {'name':'upperWickMean5','unit':'ratio_0_1','definition':'mean((H-max(O,C))/(H-L)), latest 5; flat candle => null window'},
    {'name':'positiveCloseDays5','unit':'count_0_5','definition':'sum(I(C[j]>C[j-1])), j=t-4..t; requires 6 closes'},
    {'name':'priorHigh20AgeSessions','unit':'trading_sessions_1_20','definition':'t-latest_argmax(H[t-20:t-1]); current candle excluded; latest tie wins'},
    {'name':'drawdownFromPrior60ClosePeakPercent','unit':'percent_nonpositive','definition':'100*min(0,C[t]/max(C[t-60:t-1])-1); current candle excluded'},
]
EXTRA_FEATURE_NAMES = [s['name'] for s in EXTRA_FEATURE_SPECS]
assert len(EXTRA_FEATURE_NAMES) == 32


def finite(value):
    return isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value)


def finite_or_null(value):
    return value if finite(value) else None


def original_inputs18(feature, context):
    f=feature;c=context or {};close=f.get('close');open_=f.get('open');gap=f.get('gapFromPreviousClosePercent');sma60=f.get('sma60')
    valid_price=finite(close) and close>0 and finite(open_) and open_>0
    close_return=((1+gap/100)*(close/open_)-1)*100 if valid_price and finite(gap) else None
    body=(close/open_-1)*100 if valid_price else None
    values=[f.get('atrPercent14'),f.get('volumeRatio20'),c.get('chaikinMoneyFlow21'),
        c.get('distanceFromPriorHigh20Percent'),c.get('bollingerWidth20Percent'),close_return,gap,body,
        f.get('rsi14'),f.get('sma20DistancePercent'),(close/sma60-1)*100 if finite(close) and finite(sma60) and sma60>0 else None,
        c.get('return5Percent'),c.get('return20Percent'),c.get('return60Percent'),c.get('closeLocation'),
        100*c['upperWickRatio'] if finite(c.get('upperWickRatio')) else None,c.get('benchmarkReturn20Percent'),
        100*c['breadthAboveSma20'] if finite(c.get('breadthAboveSma20')) else None]
    return list(map(finite_or_null,values))


class Stats:
    """Nullable window sums/counts; an observed zero is distinct from missing."""
    def __init__(self, values):
        self.values=values;self.sums=[0.0];self.squares=[0.0];self.missing=[0]
        for value in values:
            ok=finite(value);v=value if ok else 0.0
            self.sums.append(self.sums[-1]+v);self.squares.append(self.squares[-1]+v*v);self.missing.append(self.missing[-1]+(not ok))
    def total(self,end,length):
        start=end-length+1
        if start<0 or end>=len(self.values) or self.missing[end+1]!=self.missing[start]:return None
        return finite_or_null(self.sums[end+1]-self.sums[start])
    def mean(self,end,length):
        total=self.total(end,length)
        return total/length if total is not None else None
    def sd(self,end,length):
        total=self.total(end,length)
        if total is None or length<2:return None
        start=end-length+1;ss=self.squares[end+1]-self.squares[start]
        return math.sqrt(max(0.0,(ss-total*total/length)/(length-1)))


def safe_ratio(numerator, denominator):
    return finite_or_null(numerator/denominator) if finite(numerator) and finite(denominator) and denominator>0 else None


def _bar(row):
    if not row or row.get('source')!='kis':return None
    o,h,l,c=[row.get(k) for k in ['open','high','low','close']]
    if not all(finite(v) and v>0 for v in [o,h,l,c]) or h<max(o,l,c) or l>min(o,h,c):return None
    v=row.get('volume');v=v if finite(v) and v>=0 else None
    return (o,h,l,c,v)


def _rolling_max(values,length):
    q=deque();out=[];missing=0
    for i,value in enumerate(values):
        missing+=not finite(value)
        if i>=length:missing-=not finite(values[i-length])
        while q and q[0]<=i-length:q.popleft()
        if finite(value):
            while q and values[q[-1]]<=value:q.pop()
            q.append(i)
        out.append((values[q[0]],q[0]) if i+1>=length and missing==0 and q else (None,None))
    return out


class ObservedSetupFeatures:
    """Reusable aligned calendar module. Each at() reads causal prefix statistics only."""
    def __init__(self,calendar,rows_by_date):
        self.calendar=tuple(calendar);self.index={d:i for i,d in enumerate(calendar)}
        if len(self.index)!=len(calendar) or list(calendar)!=sorted(calendar):raise ValueError('Calendar must be sorted unique dates')
        self.bars=[_bar(rows_by_date.get(d)) for d in calendar]
        self.close=[b[3] if b else None for b in self.bars];self.high=[b[1] if b else None for b in self.bars]
        volume=[b[4] if b else None for b in self.bars]
        tr=[];strict_tr=[];returns=[];ranges=[];clv=[];body=[];wick=[];bull_volume=[];up_volume=[];up_days=[]
        for i,b in enumerate(self.bars):
            previous=self.bars[i-1] if i else None
            if b:
                o,h,l,c,v=b;spread=h-l
                value=max(spread,abs(h-previous[3]),abs(l-previous[3])) if previous else spread
                tr.append(value);strict_tr.append(value if previous else None)
                ranges.append(spread/c);clv.append((2*c-l-h)/spread if spread>0 else None)
                body.append((c/o-1)*100);wick.append((h-max(o,c))/spread if spread>0 else None)
                bull_volume.append(v*(c>o) if v is not None else None)
            else:tr.append(None);strict_tr.append(None);ranges.append(None);clv.append(None);body.append(None);wick.append(None);bull_volume.append(None)
            if b and previous:
                returns.append(math.log(b[3]/previous[3]));up_days.append(int(b[3]>previous[3]))
                up_volume.append(b[4]*int(b[3]>previous[3]) if b[4] is not None else None)
            else:returns.append(None);up_days.append(None);up_volume.append(None)
        self.atr={}
        for period in [5,20]:
            out=[];n=0;seed=0.0;value=None
            for r in tr:
                if r is None:n=0;seed=0.0;value=None;out.append(None);continue
                n+=1
                if n<=period:seed+=r;value=seed/period if n==period else None
                else:value=((period-1)*value+r)/period
                out.append(value)
            self.atr[period]=out
        self.stats={name:Stats(values) for name,values in {
            'close':self.close,'volume':volume,'returns':returns,'range':ranges,'clv':clv,'body':body,'wick':wick,
            'bullVolume':bull_volume,'upVolume':up_volume,'upDays':up_days,'tr':strict_tr,
            'turnover':[b[3]*b[4] if b and b[4] is not None else None for b in self.bars],
        }.items()}
        self.max_high={n:_rolling_max(self.high,n) for n in [5,10,20,60,120]}
        self.max_close60=_rolling_max(self.close,60)
    def at(self,as_of):
        t=self.index[as_of];c=self.close[t];s=self.stats
        def mean(name,n,end=t):return s[name].mean(end,n)
        def ratio(a,b):return safe_ratio(a,b)
        def return_n(n,end=t):
            start=end-n
            if start<0 or s['close'].total(end,n+1) is None:return None
            return (self.close[end]/self.close[start]-1)*100
        out={f'return{n}Percent':return_n(n) for n in [1,2,3,10,40,120]}
        ma5=mean('close',5);ma20=mean('close',20)
        out['closeSma5DistancePercent']=(c/ma5-1)*100 if finite(c) and finite(ma5) and ma5>0 else None
        out['sma5ToSma20Ratio']=ratio(ma5,ma20)
        out['return20ExcludingRecent5Percent']=return_n(15,t-5)
        for n in [5,10,60,120]:
            high=self.max_high[n][t-1][0] if t>0 else None
            out[f'distanceFromPriorHigh{n}Percent']=(c/high-1)*100 if finite(c) and finite(high) and high>0 else None
        out['atr5ToAtr20Ratio']=ratio(self.atr[5][t],self.atr[20][t])
        out['returnVolatility5To20Ratio']=ratio(s['returns'].sd(t,5),s['returns'].sd(t,20))
        out['normalizedRange5To20Ratio']=ratio(mean('range',5),mean('range',20))
        out['todayTrToPrior20MeanRatio']=ratio(s['tr'].values[t],mean('tr',20,t-1))
        out['volumeMean3ToPrevious20Ratio']=ratio(mean('volume',3),mean('volume',20,t-3))
        out['volumeMean5ToPrevious20Ratio']=ratio(mean('volume',5),mean('volume',20,t-5))
        out['todayVolumeToPrior5MeanRatio']=ratio(s['volume'].values[t],mean('volume',5,t-1))
        out['bullishVolumeShare5']=ratio(s['bullVolume'].total(t,5),s['volume'].total(t,5))
        out['upCloseVolumeShare10']=ratio(s['upVolume'].total(t,10),s['volume'].total(t,10))
        out['todayTurnoverToPrior20MeanRatio']=ratio(s['turnover'].values[t],mean('turnover',20,t-1))
        turnover=mean('turnover',20)
        out['logAverageTurnover20']=math.log(turnover) if finite(turnover) and turnover>0 else None
        for n in [3,5]:out[f'clvMean{n}']=mean('clv',n);out[f'candleBodyMean{n}Percent']=mean('body',n)
        out['upperWickMean5']=mean('wick',5)
        out['positiveCloseDays5']=s['upDays'].total(t,5)
        high,at=self.max_high[20][t-1] if t>0 else (None,None)
        out['priorHigh20AgeSessions']=t-at if at is not None else None
        peak=self.max_close60[t-1][0] if t>0 else None
        out['drawdownFromPrior60ClosePeakPercent']=min(0.0,(c/peak-1)*100) if finite(c) and finite(peak) and peak>0 else None
        return [finite_or_null(out[name]) for name in EXTRA_FEATURE_NAMES]

"""Independent read-only reconstruction shared by completed NAVER audits."""
import hashlib,json,pathlib,warnings
import numpy as np
warnings.filterwarnings('ignore',message='X does not have valid feature names')
E=pathlib.Path('/tmp/composite-score-experimental-20260930');C=E/'naver-cache';F=E/'first-passage-study'
def read(p):return json.loads(pathlib.Path(p).read_text())
def sha(p):
    with pathlib.Path(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
M=read(C/'manifest.json');dates=M['signalDates'];train=M['trainDates'];primary=M['primaryDates'];calendar=M['calendarDates'];syms=M['symbols'];ci={d:i for i,d in enumerate(calendar)};di={d:i for i,d in enumerate(dates)}
X=np.load(C/'X50.npy',mmap_mode='r');S=np.load(C/'sourceSignals7.npy',mmap_mode='r');turn=np.load(C/'turnover.npy',mmap_mode='r');sym=np.load(C/'symbols.npy',mmap_mode='r');off=np.load(C/'offsets.npy');raw=np.load(C/'rawBars.npy',mmap_mode='r')
winnerfiles=[E/'naver/winners-frozen-before-primary.json',E/'naver-l0/winners-frozen-before-primary.json',F/'naver-winner-frozen-before-primary.json']
assert all(read(p)['noPrimaryOutcomesUsed'] for p in winnerfiles),'All five choices must freeze before any primary-label audit'
labels={}
def span(d):i=di[d];return int(off[i]),int(off[i+1])
def label(d):
    if d in labels:return labels[d]
    a,b=span(d);r=np.asarray(raw[sym[a:b],ci[d]+1:ci[d]+6,:]);p=r[:,:,:4]
    valid=np.isfinite(p).all(axis=(1,2))&(p>0).all(axis=(1,2))&(p[:,:,1]>=p.max(axis=2)).all(axis=1)&(p[:,:,2]<=p.min(axis=2)).all(axis=1)
    strict=valid&np.isfinite(r[:,:,4]).all(axis=1)&(r[:,:,4]>0).all(axis=1);entry=r[:,0,0]
    gross=np.divide(r[:,-1,3],entry,out=np.full(b-a,np.nan),where=np.isfinite(entry)&(entry>0))-1;net=gross-.003
    t=(r[:,:,1]>=entry[:,None]*110/100).any(axis=1)&valid;bull=r[:,0,3]>r[:,0,0]
    with np.errstate(divide='ignore',invalid='ignore'):
        mae=np.minimum(0,np.min(r[:,:,2],axis=1)/entry-1);maxgain=(np.max(r[:,:,1],axis=1)/entry-1)*100
    gross[~valid]=np.nan;net[~valid]=np.nan;mae[~valid]=np.nan;maxgain[~valid]=np.nan
    present=np.isfinite(r).any(axis=2);zero=((~np.isfinite(r[:,:,4])|(r[:,:,4]<=0))&present).any(axis=1);missing=~present.all(axis=1)
    fpSafe=np.zeros(b-a,dtype=np.uint8);fpLoss=np.zeros(b-a,dtype=np.uint8);fpNet=np.full(b-a,np.nan);fpAmb=np.zeros(b-a,dtype=np.uint8);fpReason=np.zeros(b-a,dtype=np.uint8);fpDay=np.zeros(b-a,dtype=np.uint8)
    assert np.all(p[strict]==np.floor(p[strict])) and np.max(p[strict])<1e9
    q=p[strict].astype(np.int64);en=q[:,0,0];reason=np.zeros(len(q),dtype=np.uint8);day=np.zeros(len(q),dtype=np.uint8);amb=np.zeros(len(q),dtype=np.uint8);ep=np.zeros(len(q))
    for j in range(5):
        active=reason==0;o,h,l,c=q[:,j,:].T;gs=active&(20*o<=19*en);gt=active&~gs&(10*o>=11*en);mid=active&~gs&~gt;st=mid&(20*l<=19*en);tt=mid&~st&(10*h>=11*en)
        amb[mid&(20*l<=19*en)&(10*h>=11*en)]=1
        for hit,code,price in [(gs,3,o),(gt,1,en*1.1),(st,2,en*.95),(tt,1,en*1.1)]:reason[hit]=code;day[hit]=j+1;ep[hit]=price[hit]
    horizon=reason==0;reason[horizon]=4;day[horizon]=5;ep[horizon]=q[horizon,-1,3]
    fpSafe[strict]=reason==1;fpLoss[strict]=np.isin(reason,[2,3])|(horizon&(1000*q[:,-1,3]<1003*en));fpNet[strict]=ep/en-1-.003;fpAmb[strict]=amb;fpReason[strict]=reason;fpDay[strict]=day
    z={'strict':strict,'valid':valid,'touch':t,'bull':bull,'gross':gross,'net':net,'mae':mae,'maxgain':maxgain,'target':np.where(t,.10,gross)-.003,'zero':zero,'missing':missing,'fpSafe':fpSafe,'fpLoss':fpLoss,'fpNet':fpNet,'fpAmb':fpAmb,'fpReason':fpReason,'fpDay':fpDay}
    labels[d]=z;return z
def events(d,risk):
    p=label(d)
    return np.column_stack([p['fpSafe'] if risk=='FP' else p['touch'],p['bull'],p['fpLoss'] if risk=='FP' else p['net']<0 if risk=='L0' else p['net']<=-.05]).astype(np.uint8)
def parts(dd,n,risk):
    masks=[label(d)['strict'] for d in dd];xx=np.concatenate([X[slice(*span(d)),:n][mask] for d,mask in zip(dd,masks)]);ee=np.concatenate([events(d,risk)[mask] for d,mask in zip(dd,masks)]);g=np.array([int(mask.sum()) for mask in masks],dtype=np.int32)
    assert np.all(g>0);w=np.concatenate([np.full(int(k),len(ee)/(len(dd)*int(k)),dtype=np.float64) for k in g]);assert abs(w.mean()-1)<1e-12
    return xx,ee,g,w
def target(ee,lam):
    table=np.array([(.8*((i>>2)&1)+.2*(i&1)+lam*(1-((i>>1)&1)))/(1+lam) for i in range(8)]);bits=4*ee[:,0]+2*ee[:,2]+ee[:,1];gains=sorted(set(float(v) for v in table));grades=np.array([gains.index(float(v)) for v in table],dtype=np.int32)[bits]
    return table[bits],gains,grades
def window(asof):end=ci[asof]-5;w=calendar[end-504:end+1];assert len(w)==505 and all(d in di for d in w);assert calendar[ci[w[-1]]+5]==asof;return w

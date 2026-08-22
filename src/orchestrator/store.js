import { normalizeOrchestratorSnapshot } from './store-codec.js';

const DB_NAME='nolane-sentinel-orchestrator-v1';
const DB_VERSION=1;
let dbPromise=null;

function txDone(tx){return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('IndexedDB transaction aborted'));});}
function requestValue(request){return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
function ensureStore(db,name,options,indexes=[]){
  const store=db.objectStoreNames.contains(name)?null:db.createObjectStore(name,options);
  if(!store)return;
  for(const [indexName,keyPath,opts] of indexes)store.createIndex(indexName,keyPath,opts||{unique:false});
}

export function openOrchestratorStore(){
  if(dbPromise)return dbPromise;
  if(typeof indexedDB==='undefined')return Promise.reject(new Error('IndexedDB unavailable'));
  dbPromise=new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>{
      const db=request.result;
      ensureStore(db,'tasks',{keyPath:'id'});
      ensureStore(db,'workers',{keyPath:'id'},[['taskId','taskId',{unique:false}],['tabId','tabId',{unique:false}]]);
      ensureStore(db,'leases',{keyPath:'id'},[['workerId','workerId',{unique:false}],['ownerId','ownerId',{unique:false}]]);
      ensureStore(db,'checkpoints',{keyPath:'id'},[['taskId','taskId',{unique:false}],['createdAt','createdAt',{unique:false}]]);
      ensureStore(db,'artifacts',{keyPath:'id'},[['taskId','taskId',{unique:false}],['workerId','workerId',{unique:false}]]);
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>{dbPromise=null;reject(request.error);};
    request.onblocked=()=>{dbPromise=null;reject(new Error('Orchestrator IndexedDB upgrade blocked'));};
  });
  return dbPromise;
}

async function saveOne(storeName,record){
  if(!record?.id)throw new Error(`${storeName} record requires id`);
  const db=await openOrchestratorStore(),tx=db.transaction(storeName,'readwrite');
  tx.objectStore(storeName).put(structuredClone(record));await txDone(tx);return structuredClone(record);
}

export const saveTask=(record)=>saveOne('tasks',record);
export const saveWorker=(record)=>saveOne('workers',record);
export const saveLease=(record)=>saveOne('leases',record);
export const saveCheckpoint=(record)=>saveOne('checkpoints',record);

export async function saveArtifacts(records=[]){
  const items=(Array.isArray(records)?records:[]).filter((item)=>item?.id);
  if(!items.length)return [];
  const db=await openOrchestratorStore(),tx=db.transaction('artifacts','readwrite'),store=tx.objectStore('artifacts');
  for(const item of items)store.put(structuredClone(item));
  await txDone(tx);return structuredClone(items);
}

export async function loadOrchestratorSnapshot(){
  const db=await openOrchestratorStore(),names=['tasks','workers','leases','checkpoints','artifacts'];
  const tx=db.transaction(names,'readonly');
  const pending=Object.fromEntries(names.map((name)=>[name,requestValue(tx.objectStore(name).getAll())]));
  const snapshot={};for(const name of names)snapshot[name]=await pending[name];
  await txDone(tx);return normalizeOrchestratorSnapshot(snapshot);
}

export { DB_NAME as ORCHESTRATOR_DB_NAME,DB_VERSION as ORCHESTRATOR_DB_VERSION };

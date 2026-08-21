const DB_NAME='nolane-sentinel-vault', DB_VERSION=1;
let dbPromise;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions',{keyPath:'tabId'});
      if(!db.objectStoreNames.contains('timeline')) {
        const store=db.createObjectStore('timeline',{keyPath:'id',autoIncrement:true});
        store.createIndex('tabId','tabId',{unique:false}); store.createIndex('timestamp','timestamp',{unique:false});
      }
    };
    request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error);
  });
  return dbPromise;
}

function txDone(tx){return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}

export async function getStoredSession(tabId) {
  const db=await openDb();
  return new Promise((resolve,reject)=>{const tx=db.transaction('sessions','readonly'),r=tx.objectStore('sessions').get(tabId);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);});
}

export async function putSession(session) {
  const db=await openDb(), tx=db.transaction('sessions','readwrite');
  tx.objectStore('sessions').put({...session,updatedAt:Date.now()}); await txDone(tx);
}
export async function appendTimeline(tabId,event) {
  const db=await openDb(), tx=db.transaction('timeline','readwrite');
  tx.objectStore('timeline').add({tabId,timestamp:Date.now(),...event}); await txDone(tx);
}
export async function getContext(tabId,limit=250) {
  const db=await openDb();
  const session=await getStoredSession(tabId);
  const timeline=await new Promise((resolve,reject)=>{
    const tx=db.transaction('timeline','readonly'), idx=tx.objectStore('timeline').index('tabId'), req=idx.openCursor(IDBKeyRange.only(tabId),'prev'), rows=[];
    req.onsuccess=()=>{const c=req.result;if(!c || rows.length>=limit){resolve(rows.reverse());return;} rows.push(c.value);c.continue();};req.onerror=()=>reject(req.error);
  });
  return {session,timeline};
}
export async function deleteContext(tabId) {
  const db=await openDb();
  const tx=db.transaction(['sessions','timeline'],'readwrite'); tx.objectStore('sessions').delete(tabId);
  const idx=tx.objectStore('timeline').index('tabId'), req=idx.openCursor(IDBKeyRange.only(tabId));
  req.onsuccess=()=>{const c=req.result;if(c){c.delete();c.continue();}}; await txDone(tx);
}
export async function pruneContext(beforeTimestamp) {
  const db=await openDb(), tx=db.transaction('timeline','readwrite'), idx=tx.objectStore('timeline').index('timestamp'), req=idx.openCursor(IDBKeyRange.upperBound(beforeTimestamp));
  req.onsuccess=()=>{const c=req.result;if(c){c.delete();c.continue();}}; await txDone(tx);
}

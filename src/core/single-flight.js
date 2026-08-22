export function createSingleFlightGuard(){
  const active=new Set();
  return Object.freeze({
    tryClaim(key){
      const id=String(key);
      if(active.has(id))return false;
      active.add(id);
      return true;
    },
    release(key){active.delete(String(key));},
    has(key){return active.has(String(key));},
    activeCount(){return active.size;}
  });
}

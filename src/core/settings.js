const NESTED_KEYS=['recovery','handoff','artifactDownloads','queue','watchdog'];
export function mergeSettingsPatch(current={},patch={}){
  const next={...current,...patch};
  for(const key of NESTED_KEYS){
    if(patch[key]&&typeof patch[key]==='object'&&!Array.isArray(patch[key]))next[key]={...(current[key]||{}),...patch[key]};
  }
  return next;
}

function editableNodes(root){return [...(root?.querySelectorAll?.('input[id],textarea[id],select[id]')||[])];}

export function captureFormState(root,activeElement=globalThis.document?.activeElement){
  const fields={};
  for(const node of editableNodes(root)){
    if(!node?.id)continue;
    const record={value:String(node.value??'')};
    if('checked' in node)record.checked=Boolean(node.checked);
    fields[node.id]=record;
  }
  const activeId=activeElement?.id&&fields[activeElement.id]?activeElement.id:null;
  const selection=activeId?{
    start:Number.isInteger(activeElement.selectionStart)?activeElement.selectionStart:null,
    end:Number.isInteger(activeElement.selectionEnd)?activeElement.selectionEnd:null
  }:null;
  return {fields,activeId,selection};
}

export function restoreFormState(root,snapshot={}){
  const fields=snapshot.fields||{};
  const nodes=editableNodes(root);
  let activeNode=null;
  for(const node of nodes){
    const record=fields[node.id];if(!record)continue;
    node.value=record.value;
    if('checked' in record&&'checked' in node)node.checked=record.checked;
    if(node.id===snapshot.activeId)activeNode=node;
  }
  if(activeNode){
    try{activeNode.focus();}catch{}
    const start=snapshot.selection?.start,end=snapshot.selection?.end;
    if(Number.isInteger(start)&&Number.isInteger(end)){
      try{
        if(typeof activeNode.setSelectionRange==='function')activeNode.setSelectionRange(start,end);
        else {activeNode.selectionStart=start;activeNode.selectionEnd=end;}
      }catch{}
    }
  }
}

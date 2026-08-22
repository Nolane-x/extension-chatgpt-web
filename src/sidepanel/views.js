import { ui } from './model.js';
import { overviewHtml,microscopeHtml } from './session-views.js';
import { filesHtml,automationHtml,bridgeHtml,settingsHtml } from './admin-views.js';
export async function render(){const root=document.getElementById('viewRoot');document.querySelectorAll('.nav-item').forEach((n)=>n.classList.toggle('active',n.dataset.view===ui.view));if(ui.view==='microscope'&&ui.selectedTabId!=null)root.innerHTML=microscopeHtml(ui.selectedTabId);else if(ui.view==='overview')root.innerHTML=overviewHtml();else if(ui.view==='files')root.innerHTML=filesHtml();else if(ui.view==='automation')root.innerHTML=automationHtml();else if(ui.view==='bridge')root.innerHTML=bridgeHtml();else root.innerHTML=settingsHtml();}

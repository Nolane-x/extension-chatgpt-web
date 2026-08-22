import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { writeDeterministicZip } from './zip-lib.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const packageJson=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const version=packageJson.version;
const releaseNotes=`RELEASE_NOTES_v${version}.md`;
const dist=path.join(root,'dist');
const release=path.join(root,'release',`v${version}`);
fs.rmSync(dist,{recursive:true,force:true});fs.mkdirSync(dist,{recursive:true});
fs.rmSync(release,{recursive:true,force:true});fs.mkdirSync(release,{recursive:true});

function filesUnder(relative){
  const base=path.join(root,relative),out=[];
  const walk=(dir)=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'))){const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else out.push(path.relative(root,full));}};
  walk(base);return out;
}
function entries(files){
  return [...new Set(files)].sort((a,b)=>a.localeCompare(b,'en')).map((relative)=>{const full=path.join(root,relative),stat=fs.statSync(full);return {name:relative,data:fs.readFileSync(full),mode:(stat.mode&0o777)|0o100000};});
}
function zip(name,files){const target=path.join(dist,name);writeDeterministicZip(target,entries(files));return target;}
function sha256(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}

if(!fs.existsSync(path.join(root,releaseNotes)))throw new Error(`Thiếu release notes: ${releaseNotes}`);
const extensionFiles=['manifest.json',...filesUnder('_locales'),...filesUnder('src')];
const nativeFiles=['package.json',...filesUnder('native-host'),'src/core/task-protocol.js','docs/protocol.md','SECURITY.md'];
const sourceFiles=['manifest.json','package.json','README.md','SECURITY.md','CHANGELOG.md',releaseNotes,'.gitignore',...filesUnder('_locales'),...filesUnder('src'),...filesUnder('native-host'),...filesUnder('docs'),...filesUnder('tests'),...filesUnder('scripts'),...filesUnder('.github')].filter((x)=>fs.existsSync(path.join(root,x)));
const artifacts=[zip(`nolane-sentinel-v${version}-extension.zip`,extensionFiles),zip(`nolane-sentinel-v${version}-native-bridge.zip`,nativeFiles),zip(`nolane-sentinel-v${version}-source.zip`,sourceFiles)];
const lines=artifacts.map((file)=>`${sha256(file)}  ${path.basename(file)}`);
const sums=path.join(dist,'SHA256SUMS.txt');fs.writeFileSync(sums,lines.join('\n')+'\n');
for(const file of [...artifacts,sums])fs.copyFileSync(file,path.join(release,path.basename(file)));
fs.copyFileSync(path.join(root,releaseNotes),path.join(release,'RELEASE_NOTES.md'));
console.log(`package-release: PASS (${artifacts.length} deterministic archives)`);
for(const file of artifacts)console.log(`${path.basename(file)} ${fs.statSync(file).size} bytes sha256=${sha256(file)}`);
console.log(`release mirror: ${path.relative(root,release)}`);

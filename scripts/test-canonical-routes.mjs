import assert from "node:assert/strict";
import fs from "node:fs";

const redirects=[
  {file:"index.html",target:"./brand/lenovo/",resolved:"https://example.test/market-pulse-dashboard/brand/lenovo/"},
  {file:"acer/index.html",target:"../brand/acer/",resolved:"https://example.test/market-pulse-dashboard/brand/acer/"}
];

for(const redirect of redirects){
  const html=fs.readFileSync(redirect.file,"utf8");
  assert.match(html,new RegExp(`location\\.replace\\(target\\.href\\)`),`${redirect.file} must replace the legacy location`);
  assert.ok(html.includes(redirect.target),`${redirect.file} must target ${redirect.target}`);
  assert.ok(!/market-data\.js|dist\/app\.js|xlsx-export\.js/.test(html),`${redirect.file} must not render a dashboard`);
  const current=redirect.file==="index.html"
    ? "https://example.test/market-pulse-dashboard/?source=legacy#MTM"
    : "https://example.test/market-pulse-dashboard/acer/?source=legacy#MTM";
  const target=new URL(redirect.target,current);
  target.search=new URL(current).search;
  target.hash=new URL(current).hash;
  assert.equal(`${target.origin}${target.pathname}`,redirect.resolved);
  assert.equal(target.search,"?source=legacy");
  assert.equal(target.hash,"#MTM");
}

for(const file of ["dist/market-data.js","acer/market-data.js","acer/app.js","acer/styles.css"]){
  assert.equal(fs.existsSync(file),false,`${file} must not remain as a legacy dashboard asset`);
}
for(const slug of ["lenovo","acer"]){
  assert.equal(fs.existsSync(`brand/${slug}/index.html`),true,`${slug} canonical dashboard is missing`);
  assert.equal(fs.existsSync(`brand/${slug}/market-data.js`),true,`${slug} canonical data is missing`);
}

console.log("Canonical brand routes and legacy redirects passed.");

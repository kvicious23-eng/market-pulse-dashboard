// Serialized into Supplier's official document. Only optional information notices
// with one visible, unobstructed top-right close control are eligible.
export async function dismissSupplierNotice() {
  const u=new URL(location.href);
  if(u.origin!=='https://supplier.coupang.com'||u.username||u.password)return {ok:false,reason:'supplier_popup_wrong_origin'};
  const visible=e=>!!(e&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none');
  const text=e=>(e?.innerText||e?.textContent||'').replace(/\s+/g,' ').trim();
  const blocked=/접근이 제한|접근이 차단|Access Denied|자동.?입력.?방지|로봇이 아닙|보안.?문자|인증번호.{0,20}(입력|전송)|본인.?인증|Verify you are human/i;
  if([...document.querySelectorAll('input[type="password"],iframe')].some(e=>visible(e)&&(e.matches('input')||/captcha|challenge/i.test(e.src)))||blocked.test(text(document.body)))return {ok:false,reason:'supplier_popup_auth_required'};
  let closed=0;
  for(let attempt=0;attempt<3;attempt++) {
    const headings=[...document.querySelectorAll('h1,h2,h3,h4,[role="heading"],div,span,p')].filter(e=>visible(e)&&e.children.length===0&&/^(?:\[안내\]\s*)?(?:프리미엄\s*데이터\s*프로모션|\[안내\].{1,80}|공지사항|프로모션 안내|서비스 안내)$/.test(text(e)));
    const candidates=new Map();
    for(const heading of headings) {
      for(let box=heading.parentElement;box&&box!==document.body;box=box.parentElement) {
        const r=box.getBoundingClientRect(),hr=heading.getBoundingClientRect();
        if(r.width<200||r.height<100||hr.top>r.top+100||!visible(box))continue;
        const buttons=[...box.querySelectorAll('button,[role="button"],a,[aria-label],[title],[class*="close" i]')].filter(e=>{
          if(!visible(e)||e.disabled||e.getAttribute('aria-disabled')==='true')return false;
          const label=[e.getAttribute('aria-label'),e.getAttribute('title'),text(e)].filter(Boolean).join(' ').trim();
          const explicit=/^(?:닫기|창 닫기|팝업 닫기|close|dismiss|×|✕|✖|x)$/i.test(label)||/close/i.test(e.getAttribute('class')||'')||!!e.querySelector('[data-icon="close"],svg[aria-label="close"],[data-testid*="Close"]');
          const b=e.getBoundingClientRect();
          return explicit&&b.width>8&&b.width<100&&b.height>8&&b.height<100&&b.top>=r.top-2&&b.top<r.top+80&&b.right<=r.right+2&&b.left>r.left+r.width*.65;
        });
        // Nested icons and their parent button represent one control.
        const controls=buttons.filter(e=>!buttons.some(other=>other!==e&&other.contains(e)));
        if(controls.length===1){candidates.set(controls[0],box);break;}
      }
    }
    if(!candidates.size)return headings.length?{ok:false,closed,reason:'supplier_popup_close_unconfirmed'}:{ok:true,closed,reason:closed?'supplier_popup_closed':'supplier_popup_absent'};
    if(candidates.size!==1)return {ok:false,closed,reason:'supplier_popup_ambiguous'};
    const [button,box]=[...candidates][0],b=button.getBoundingClientRect();
    const hit=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);
    if(!hit||!(button===hit||button.contains(hit)))return {ok:false,closed,reason:'supplier_popup_close_obscured'};
    button.click();
    for(let i=0;i<10&&visible(box)&&visible(button);i++)await new Promise(resolve=>setTimeout(resolve,100));
    if(visible(box)&&visible(button))return {ok:false,closed,reason:'supplier_popup_still_open'};
    closed++;
  }
  return {ok:false,closed,reason:'supplier_popup_limit'};
}

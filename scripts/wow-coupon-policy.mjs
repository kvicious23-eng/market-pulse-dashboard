// Compare item amounts before cards and shipping. Checkout item amount is
// reconstructed from the anchored basis and the three verified checkout rows.
export function wowCouponDetails(basis,page,regular,instant,observed){
 const money=n=>Number.isSafeInteger(n)&&n>=0&&n<=7000000;
 const raw=money(observed)?observed:null;
 const result={observedWowCouponDiscount:raw,checkoutPreCardItemPrice:null,wowCouponTreatment:'unverified',wowCouponDiscount:null,excludedWowCouponDiscount:null};
 if(![basis,page,regular,instant,observed].every(money)||page>basis)return result;
 const checkout=basis-regular-instant-observed;
 if(checkout<0||checkout>basis)return result;
 const treatment=observed===0?'none':checkout===page?'included':checkout<page?'excluded':'unverified';
 return {...result,checkoutPreCardItemPrice:checkout,wowCouponTreatment:treatment,
  wowCouponDiscount:['included','none'].includes(treatment)?observed:treatment==='excluded'?0:null,
  excludedWowCouponDiscount:treatment==='excluded'?observed:null};
}

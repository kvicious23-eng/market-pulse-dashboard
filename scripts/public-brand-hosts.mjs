import {createHash} from 'node:crypto';
export const validBrandSlug=s=>typeof s==='string'&&/^[\p{L}\p{Nd}]+(?:-[\p{L}\p{Nd}]+)*$/u.test(s)&&s===s.toLowerCase();
export function brandProject(slug){
 if(!validBrandSlug(slug))throw Error('Invalid brand host slug');
 let suffix=/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)&&slug.length<=44?slug:'b-'+createHash('sha256').update(slug).digest('hex').slice(0,20);
 if(suffix==='public')suffix='b-'+createHash('sha256').update(slug).digest('hex').slice(0,20);
 return 'market-pulse-'+suffix;
}
export const brandOrigin=slug=>'https://'+brandProject(slug)+'.pages.dev/';

'use client';
export function photoCell(p) {
  const categories={Cupcakes:6,Donuts:7,Desserts:8,Sundaes:9,Cookies:10,Brownies:11};
  if(categories[p.category]!==undefined)return categories[p.category];
  if(/Pistachio/.test(p.name))return 2;if(/Red Velvet/.test(p.name))return 3;if(/Milk|Raffaello|Cheesecake/.test(p.name))return 1;return 0;
}
export default function Photo({product,cell,compact=false}) {
  const n=cell??photoCell(product);const uploaded=!!product.imageUrl;
  return <div role="img" aria-label={uploaded?product.name:`Representative AI-generated ${product.category.toLowerCase()} photo, not an exact product photograph`} className={`product-photo ${compact?'compact':''}`} style={uploaded?{backgroundImage:`url("${product.imageUrl}")`,backgroundSize:'cover',backgroundPosition:'center'}:{backgroundImage:'url(/images/bakery.jpg)',backgroundSize:'400% 300%',backgroundPosition:`${n%4*100/3}% ${Math.floor(n/4)*50}%`}}><span>{uploaded?'Bakery supplied photo':'Representative · AI generated'}</span></div>;
}

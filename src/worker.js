
const HTML = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MetaRoot License Admin</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#0b1220;color:#eaf2ff;font:15px Arial,sans-serif}
main{max-width:950px;margin:35px auto;padding:15px}
h1{color:#55d6a3;font-size:25px}
h2{font-size:18px}
.card{background:#142137;border:1px solid #293c56;border-radius:14px;padding:20px;margin:15px 0}
input{background:#0b1729;border:1px solid #354b68;color:white;padding:12px;border-radius:8px;width:100%;margin:7px 0}
button{background:#55d6a3;color:#062016;border:0;padding:11px 15px;border-radius:8px;font-weight:bold;margin:5px 3px;cursor:pointer}
button.danger{background:#a94350;color:white}
button.gray{background:#344963;color:white}
small{color:#a5b6ca}
table{width:100%;border-collapse:collapse;min-width:650px}
td,th{text-align:left;padding:11px;border-bottom:1px solid #30415a;font-size:13px}
.wrap{overflow-x:auto}
.hidden{display:none}
.msg{padding:10px;margin:10px 0;border-radius:8px;background:#203b4d;overflow-wrap:anywhere}
.key{color:#55d6a3;overflow-wrap:anywhere;font-family:monospace}
</style>
</head>
<body>
<main>
<h1>MetaRoot License Admin</h1>
<small>Register License Management · Cloudflare Workers</small>

<section id="login" class="card">
<h2>Admin Login</h2>
<input id="password" type="password" placeholder="Admin password">
<button onclick="login()">Login</button>
<div id="loginMsg"></div>
</section>

<section id="panel" class="hidden">
<div class="card">
<h2>Generate Register Key</h2>
<input id="label" maxlength="80" placeholder="Nama pengguna / label">
<input id="expiry" type="datetime-local">
<button onclick="createKey()">Generate Key</button>
<div id="generated"></div>
</div>

<div class="card">
<h2>Daftar Lisensi</h2>
<button class="gray" onclick="loadKeys()">Refresh</button>
<div class="wrap">
<table>
<thead><tr>
<th>Label</th><th>Status</th><th>Device</th>
<th>Expired</th><th>Aksi</th>
</tr></thead>
<tbody id="rows"></tbody>
</table>
</div>
<div id="listMsg"></div>
</div>
</section>
</main>
<script>
async function api(path,method="GET",body=null){
 const r=await fetch(path,{
  method,credentials:"same-origin",
  headers:{"Content-Type":"application/json"},
  body:body?JSON.stringify(body):undefined
 });
 const d=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(d.error||"Request failed");
 return d;
}
function msg(id,text){document.getElementById(id).textContent=text}
async function login(){
 try{
  await api("/api/admin-login","POST",{
   password:document.getElementById("password").value
  });
  document.getElementById("password").value="";
  document.getElementById("login").classList.add("hidden");
  document.getElementById("panel").classList.remove("hidden");
  loadKeys();
 }catch(e){msg("loginMsg",e.message)}
}
async function createKey(){
 try{
  const label=document.getElementById("label").value;
  const expiry=document.getElementById("expiry").value;
  const d=await api("/api/create-license","POST",{
   label,expires_at:expiry?new Date(expiry).toISOString():null
  });
  const box=document.getElementById("generated");
  box.innerHTML="";
  const title=document.createElement("p");
  title.textContent="Register Key berhasil dibuat. Simpan sekarang:";
  const code=document.createElement("p");
  code.className="key";
  code.textContent=d.key;
  const copy=document.createElement("button");
  copy.textContent="Salin Key";
  copy.onclick=async()=>{
   try{await navigator.clipboard.writeText(d.key);copy.textContent="Tersalin"}
   catch{copy.textContent="Salin manual"}
  };
  box.append(title,code,copy);
  document.getElementById("label").value="";
  document.getElementById("expiry").value="";
  loadKeys();
 }catch(e){msg("generated",e.message)}
}
async function loadKeys(){
 try{
  const d=await api("/api/licenses");
  const rows=document.getElementById("rows");
  rows.replaceChildren();
  for(const k of d.licenses){
   const tr=document.createElement("tr");
   const values=[
    k.label||"-",
    k.is_active?(k.device_hash?"Terikat":"Belum aktivasi"):"Nonaktif",
    k.device_hash?"Terdaftar":"Kosong",
    k.expires_at?new Date(k.expires_at).toLocaleString():"Tidak ada"
   ];
   for(const v of values){
    const td=document.createElement("td");
    td.textContent=v;tr.append(td);
   }
   const action=document.createElement("td");
   if(k.device_hash){
    const reset=document.createElement("button");
    reset.className="gray";reset.textContent="Reset Device";
    reset.onclick=()=>resetDevice(k.id);
    action.append(reset);
   }
   if(k.is_active){
    const revoke=document.createElement("button");
    revoke.className="danger";revoke.textContent="Revoke";
    revoke.onclick=()=>revokeKey(k.id);
    action.append(revoke);
   }
   tr.append(action);rows.append(tr);
  }
  if(!d.licenses.length){
   const tr=document.createElement("tr");
   const td=document.createElement("td");
   td.colSpan=5;td.textContent="Belum ada lisensi";
   tr.append(td);rows.append(tr);
  }
 }catch(e){msg("listMsg",e.message)}
}
async function resetDevice(id){
 if(!confirm("Lepaskan ikatan perangkat lisensi ini?"))return;
 try{await api("/api/reset-device","POST",{id});loadKeys()}
 catch(e){msg("listMsg",e.message)}
}
async function revokeKey(id){
 if(!confirm("Nonaktifkan Register Key ini?"))return;
 try{await api("/api/revoke-license","POST",{id});loadKeys()}
 catch(e){msg("listMsg",e.message)}
}
</script>
</body>
</html>`;

const json = (data, status=200, extra={}) =>
 new Response(JSON.stringify(data), {
  status,
  headers: {
   "Content-Type":"application/json",
   "Cache-Control":"no-store",
   ...extra
  }
 });

async function hash(value) {
 const result=await crypto.subtle.digest(
  "SHA-256",new TextEncoder().encode(value)
 );
 return [...new Uint8Array(result)]
  .map(x=>x.toString(16).padStart(2,"0")).join("");
}

function b64url(bytes) {
 let s="";
 for(const b of new Uint8Array(bytes))s+=String.fromCharCode(b);
 return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}

function unb64(value) {
 const s=atob(value.replace(/-/g,"+").replace(/_/g,"/")+"===");
 return Uint8Array.from(s,c=>c.charCodeAt(0));
}

async function makeSession(secret) {
 const exp=Math.floor(Date.now()/1000)+28800;
 const key=await crypto.subtle.importKey(
  "raw",new TextEncoder().encode(secret),
  {name:"HMAC",hash:"SHA-256"},false,["sign"]
 );
 const sig=await crypto.subtle.sign(
  "HMAC",key,new TextEncoder().encode(String(exp))
 );
 return exp+"."+b64url(sig);
}

function cookie(request) {
 const text=request.headers.get("Cookie")||"";
 const item=text.split(";").map(x=>x.trim())
  .find(x=>x.startsWith("mr_admin="));
 return item?item.substring(9):"";
}

async function isAdmin(request,secret) {
 try {
  const p=cookie(request).split(".");
  if(p.length!==2)return false;
  const exp=Number(p[0]);
  if(!Number.isSafeInteger(exp)||exp<=Date.now()/1000)return false;
  const key=await crypto.subtle.importKey(
   "raw",new TextEncoder().encode(secret),
   {name:"HMAC",hash:"SHA-256"},false,["verify"]
  );
  return await crypto.subtle.verify(
   "HMAC",key,unb64(p[1]),new TextEncoder().encode(String(exp))
  );
 }catch{return false}
}

async function body(request) {
 try{return await request.json()}catch{return null}
}

async function db(env,path,options={}) {
 const base=env.SUPABASE_URL.replace(/\/+$/,"");
 const r=await fetch(base+"/rest/v1/"+path,{
  ...options,
  headers:{
   apikey:env.SUPABASE_SECRET_KEY,
   Authorization:"Bearer "+env.SUPABASE_SECRET_KEY,
   "Content-Type":"application/json",
   ...(options.headers||{})
  }
 });
 if(!r.ok){
  console.error("Supabase:",r.status,await r.text());
  throw Error("Database operation failed");
 }
 if(r.status===204)return null;
 return r.json();
}

function makeRegisterKey(){
 const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
 const bytes=crypto.getRandomValues(new Uint8Array(12));
 let groups=[];
 for(let g=0;g<3;g++){
  let part="";
  for(let i=0;i<4;i++)part+=chars[bytes[g*4+i]%chars.length];
  groups.push(part);
 }
 return "MR-"+groups.join("-");
}

function validId(id){
 return typeof id==="string"&&
 /^[0-9a-f-]{36}$/i.test(id);
}

export default {
 async fetch(request,env){
  const url=new URL(request.url);
  const path=url.pathname;
  const method=request.method;

  try{
   if(method==="GET"&&path==="/admin"){
    return new Response(HTML,{
     headers:{
      "Content-Type":"text/html;charset=UTF-8",
      "Cache-Control":"no-store",
      "X-Content-Type-Options":"nosniff",
      "Referrer-Policy":"no-referrer",
      "Content-Security-Policy":
       "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"
     }
    });
   }

   if(!env.SUPABASE_URL||!env.SUPABASE_SECRET_KEY||
      !env.ADMIN_PASSWORD||!env.SESSION_SECRET){
    return json({error:"Server configuration incomplete"},500);
   }

   if(method==="GET"&&path==="/"){
    return json({
     status:"online",
     service:"MetaRoot Register License",
     version:"2.0"
    });
   }

   if(method==="POST"&&path==="/api/admin-login"){
    const b=await body(request);
    if(!b||typeof b.password!=="string")
     return json({error:"Invalid request"},400);
    if(b.password!==env.ADMIN_PASSWORD)
     return json({error:"Invalid credentials"},401);
    const session=await makeSession(env.SESSION_SECRET);
    return json({success:true},200,{
     "Set-Cookie":
      "mr_admin="+session+"; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800"
    });
   }

   // Aktivasi lisensi dari aplikasi MetaRoot
   if(method==="POST"&&path==="/api/activate-license"){
    const b=await body(request);
    if(!b||typeof b.key!=="string"||
       typeof b.device_hash!=="string"||
       !/^[a-f0-9]{64}$/i.test(b.device_hash)){
     return json({success:false,error:"Invalid registration data"},400);
    }

    const keyHash=await hash(b.key.trim().toUpperCase());
    const params=new URLSearchParams({
     select:"id,label,is_active,expires_at,device_hash",
     key_hash:"eq."+keyHash,
     limit:"1"
    });
    const rows=await db(env,"api_keys?"+params);
    if(!rows.length)return json({success:false,error:"Invalid register key"},403);

    const license=rows[0];
    if(!license.is_active)
     return json({success:false,error:"License disabled"},403);
    if(license.expires_at&&
       new Date(license.expires_at).getTime()<=Date.now())
     return json({success:false,error:"License expired"},403);

    if(license.device_hash&&license.device_hash!==b.device_hash){
     return json({success:false,error:"License already bound to another device"},403);
    }

    if(!license.device_hash){
     const updateParams=new URLSearchParams({
      id:"eq."+license.id,
      device_hash:"is.null",
      is_active:"eq.true"
     });
     const updated=await db(env,"api_keys?"+updateParams,{
      method:"PATCH",
      headers:{Prefer:"return=representation"},
      body:JSON.stringify({
       device_hash:b.device_hash,
       bound_at:new Date().toISOString()
      })
     });
     if(!updated||updated.length!==1){
      return json({success:false,error:"Activation conflict. Please retry."},409);
     }
    }

    return json({
     success:true,
     activated:true,
     label:license.label||null,
     message:"License activated"
    });
   }

   const adminPaths=[
    "/api/create-license",
    "/api/licenses",
    "/api/reset-device",
    "/api/revoke-license"
   ];
   if(adminPaths.includes(path)&&
      !await isAdmin(request,env.SESSION_SECRET)){
    return json({error:"Unauthorized"},401);
   }

   if(method==="POST"&&path==="/api/create-license"){
    const b=await body(request);
    if(!b||typeof b.label!=="string"||
       !b.label.trim()||b.label.trim().length>80){
     return json({error:"Label must be 1-80 characters"},400);
    }
    let expires=null;
    if(b.expires_at){
     const d=new Date(b.expires_at);
     if(Number.isNaN(d.getTime())||d.getTime()<=Date.now())
      return json({error:"Invalid expiration date"},400);
     expires=d.toISOString();
    }

    // Retry if an extremely unlikely key collision occurs.
    for(let attempt=0;attempt<3;attempt++){
     const key=makeRegisterKey();
     const keyHash=await hash(key);
     try{
      await db(env,"api_keys",{
       method:"POST",
       headers:{Prefer:"return=minimal"},
       body:JSON.stringify({
        key_hash:keyHash,
        label:b.label.trim(),
        is_active:true,
        expires_at:expires,
        device_hash:null,
        bound_at:null
       })
      });
      return json({success:true,key},201);
     }catch(e){
      if(attempt===2)throw e;
     }
    }
   }

   if(method==="GET"&&path==="/api/licenses"){
    const params=new URLSearchParams({
     select:"id,label,is_active,expires_at,created_at,device_hash,bound_at",
     order:"created_at.desc"
    });
    const licenses=await db(env,"api_keys?"+params);
    return json({success:true,licenses});
   }

   if(method==="POST"&&path==="/api/reset-device"){
    const b=await body(request);
    if(!b||!validId(b.id))
     return json({error:"Invalid license ID"},400);
    const params=new URLSearchParams({id:"eq."+b.id});
    await db(env,"api_keys?"+params,{
     method:"PATCH",
     headers:{Prefer:"return=minimal"},
     body:JSON.stringify({device_hash:null,bound_at:null})
    });
    return json({success:true,message:"Device binding reset"});
   }

   if(method==="POST"&&path==="/api/revoke-license"){
    const b=await body(request);
    if(!b||!validId(b.id))
     return json({error:"Invalid license ID"},400);
    const params=new URLSearchParams({id:"eq."+b.id});
    await db(env,"api_keys?"+params,{
     method:"PATCH",
     headers:{Prefer:"return=minimal"},
     body:JSON.stringify({is_active:false})
    });
    return json({success:true,message:"License revoked"});
   }

   return json({error:"Not found"},404);
  }catch(e){
   console.error("Worker error:",e);
   return json({error:"Internal server error"},500);
  }
 }
};

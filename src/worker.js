
const HTML = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MetaRoot License Admin</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#0b1220;color:#eaf2ff;font:15px Arial,sans-serif}
main{max-width:950px;margin:30px auto;padding:15px}
h1{color:#55d6a3;font-size:25px}
h2{font-size:18px}
.card{background:#142137;border:1px solid #293c56;border-radius:14px;padding:20px;margin:15px 0}
input{background:#0b1729;border:1px solid #354b68;color:white;padding:12px;border-radius:8px;width:100%;margin:7px 0}
button{background:#55d6a3;color:#062016;border:0;padding:11px 15px;border-radius:8px;font-weight:bold;margin:5px 3px;cursor:pointer}
button:disabled{opacity:.5}
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
<button id="loginBtn" onclick="login()">Login</button>
<div id="loginMsg" class="msg"></div>
</section>

<section id="panel" class="hidden">
<div style="text-align:right">
<button class="gray" onclick="logout()">Logout</button>
</div>

<div class="card">
<h2>Generate Register Key</h2>
<input id="label" maxlength="80" placeholder="Nama pengguna / label">
<input id="expiry" type="datetime-local">
<button id="createBtn" onclick="createKey()">Generate Key</button>
<div id="generated" class="msg"></div>
</div>

<div class="card">
<h2>Daftar Lisensi</h2>
<button class="gray" onclick="loadKeys()">Refresh</button>
<div class="wrap">
<table>
<thead>
<tr>
<th>Label</th><th>Status</th><th>Device</th>
<th>Expired</th><th>Aksi</th>
</tr>
</thead>
<tbody id="rows"></tbody>
</table>
</div>
<div id="listMsg" class="msg"></div>
</div>
</section>
</main>

<script>
async function api(path,method="GET",data=null){
 const options={
  method,
  credentials:"same-origin",
  headers:{"Content-Type":"application/json"}
 };
 if(data!==null)options.body=JSON.stringify(data);

 const response=await fetch(path,options);
 const result=await response.json().catch(()=>({}));

 if(response.status===401){
  showLogin("Sesi admin berakhir. Silakan login kembali.");
  throw Error("Unauthorized");
 }

 if(!response.ok){
  throw Error(result.error||"Request failed");
 }
 return result;
}

function showLogin(message=""){
 document.getElementById("panel").classList.add("hidden");
 document.getElementById("login").classList.remove("hidden");
 document.getElementById("loginMsg").textContent=message;
}

async function login(){
 const button=document.getElementById("loginBtn");
 button.disabled=true;

 try{
  const password=document.getElementById("password").value;
  await api("/api/admin-login","POST",{password});

  document.getElementById("password").value="";
  document.getElementById("login").classList.add("hidden");
  document.getElementById("panel").classList.remove("hidden");

  await loadKeys();
 }catch(error){
  document.getElementById("loginMsg").textContent=error.message;
 }finally{
  button.disabled=false;
 }
}

async function logout(){
 try{await api("/api/admin-logout","POST",{});}
 catch(error){}
 showLogin("Kamu sudah logout.");
}

async function createKey(){
 const button=document.getElementById("createBtn");
 const label=document.getElementById("label").value.trim();
 const expiry=document.getElementById("expiry").value;

 if(!label){
  document.getElementById("generated").textContent="Isi nama pengguna / label terlebih dahulu.";
  return;
 }

 button.disabled=true;
 document.getElementById("generated").textContent="Membuat Register Key...";

 try{
  const result=await api("/api/create-license","POST",{
   label,
   expires_at:expiry?new Date(expiry).toISOString():null
  });

  const box=document.getElementById("generated");
  box.replaceChildren();

  const title=document.createElement("p");
  title.textContent="Register Key berhasil dibuat. Simpan sekarang:";

  const code=document.createElement("p");
  code.className="key";
  code.textContent=result.key;

  const copy=document.createElement("button");
  copy.textContent="Salin Key";
  copy.onclick=async()=>{
   try{
    await navigator.clipboard.writeText(result.key);
    copy.textContent="Tersalin";
   }catch{
    copy.textContent="Salin manual";
   }
  };

  box.append(title,code,copy);
  document.getElementById("label").value="";
  document.getElementById("expiry").value="";
  await loadKeys();
 }catch(error){
  document.getElementById("generated").textContent=error.message;
 }finally{
  button.disabled=false;
 }
}

async function loadKeys(){
 const rows=document.getElementById("rows");
 document.getElementById("listMsg").textContent="Memuat lisensi...";

 try{
  const result=await api("/api/licenses");
  rows.replaceChildren();

  for(const license of result.licenses){
   const tr=document.createElement("tr");

   const values=[
    license.label||"-",
    !license.is_active?"Nonaktif":
     license.device_hash?"Terikat":"Belum aktivasi",
    license.device_hash?"Terdaftar":"Kosong",
    license.expires_at?
     new Date(license.expires_at).toLocaleString():"Tidak ada"
   ];

   for(const value of values){
    const td=document.createElement("td");
    td.textContent=value;
    tr.append(td);
   }

   const actions=document.createElement("td");

   if(license.device_hash){
    const reset=document.createElement("button");
    reset.className="gray";
    reset.textContent="Reset Device";
    reset.onclick=()=>resetDevice(license.id);
    actions.append(reset);
   }

   if(license.is_active){
    const revoke=document.createElement("button");
    revoke.className="danger";
    revoke.textContent="Revoke";
    revoke.onclick=()=>revokeKey(license.id);
    actions.append(revoke);
   }

   tr.append(actions);
   rows.append(tr);
  }

  if(!result.licenses.length){
   const tr=document.createElement("tr");
   const td=document.createElement("td");
   td.colSpan=5;
   td.textContent="Belum ada lisensi";
   tr.append(td);
   rows.append(tr);
  }

  document.getElementById("listMsg").textContent=
   "Total lisensi: "+result.licenses.length;
 }catch(error){
  document.getElementById("listMsg").textContent=error.message;
 }
}

async function resetDevice(id){
 if(!confirm("Lepaskan ikatan perangkat lisensi ini?"))return;
 try{
  await api("/api/reset-device","POST",{id});
  await loadKeys();
 }catch(error){
  document.getElementById("listMsg").textContent=error.message;
 }
}

async function revokeKey(id){
 if(!confirm("Nonaktifkan Register Key ini?"))return;
 try{
  await api("/api/revoke-license","POST",{id});
  await loadKeys();
 }catch(error){
  document.getElementById("listMsg").textContent=error.message;
 }
}
</script>
</body>
</html>`;

const json = (data,status=200,headers={}) =>
 new Response(JSON.stringify(data),{
  status,
  headers:{
   "Content-Type":"application/json; charset=UTF-8",
   "Cache-Control":"no-store",
   ...headers
  }
});

function base64url(bytes){
 let binary="";
 for(const byte of new Uint8Array(bytes)){
  binary+=String.fromCharCode(byte);
 }
 return btoa(binary)
  .replace(/\+/g,"-")
  .replace(/\//g,"_")
  .replace(/=+$/,"");
}

function decodeBase64url(value){
 const normalized=value.replace(/-/g,"+").replace(/_/g,"/");
 const padded=normalized+"=".repeat((4-normalized.length%4)%4);
 const binary=atob(padded);
 return Uint8Array.from(binary,c=>c.charCodeAt(0));
}

async function createSession(secret){
 const expires=Math.floor(Date.now()/1000)+28800;

 const key=await crypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(secret),
  {name:"HMAC",hash:"SHA-256"},
  false,
  ["sign"]
 );

 const signature=await crypto.subtle.sign(
  "HMAC",
  key,
  new TextEncoder().encode(String(expires))
 );

 return expires+"."+base64url(signature);
}

function getCookie(request,name){
 const cookies=request.headers.get("Cookie")||"";

 for(const item of cookies.split(";")){
  const part=item.trim();
  const index=part.indexOf("=");

  if(index<0)continue;

  if(part.slice(0,index)===name){
   return part.slice(index+1);
  }
 }
 return "";
}

async function verifySession(request,secret){
 try{
  const token=getCookie(request,"mr_admin");
  const parts=token.split(".");

  if(parts.length!==2)return false;

  const expires=Number(parts[0]);

  if(!Number.isSafeInteger(expires))return false;
  if(expires<=Math.floor(Date.now()/1000))return false;

  const key=await crypto.subtle.importKey(
   "raw",
   new TextEncoder().encode(secret),
   {name:"HMAC",hash:"SHA-256"},
   false,
   ["verify"]
  );

  return await crypto.subtle.verify(
   "HMAC",
   key,
   decodeBase64url(parts[1]),
   new TextEncoder().encode(String(expires))
  );
 }catch(error){
  console.error("Session verification failed:",error);
  return false;
 }
}

async function readBody(request){
 try{
  return await request.json();
 }catch{
  return null;
 }
}

async function sha256(value){
 const digest=await crypto.subtle.digest(
  "SHA-256",
  new TextEncoder().encode(value)
 );

 return [...new Uint8Array(digest)]
  .map(byte=>byte.toString(16).padStart(2,"0"))
  .join("");
}

class DatabaseError extends Error{
 constructor(status){
  super("Database operation failed");
  this.status=status;
 }
}

async function db(env,path,options={}){
 const base=env.SUPABASE_URL.replace(/\/+$/,"");

 const response=await fetch(base+"/rest/v1/"+path,{
  ...options,
  headers:{
   apikey:env.SUPABASE_SECRET_KEY,
   Authorization:"Bearer "+env.SUPABASE_SECRET_KEY,
   "Content-Type":"application/json",
   ...(options.headers||{})
  }
 });

 if(!response.ok){
  const detail=await response.text();
  console.error("Supabase error:",response.status,detail);
  throw new DatabaseError(response.status);
 }

 const text=await response.text();
 if(!text)return null;

 try{
  return JSON.parse(text);
 }catch{
  throw new Error("Invalid database response");
 }
}

function generateKey(){
 const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
 const bytes=crypto.getRandomValues(new Uint8Array(12));

 const parts=[];
 for(let group=0;group<3;group++){
  let value="";
  for(let i=0;i<4;i++){
   value+=alphabet[bytes[group*4+i]%alphabet.length];
  }
  parts.push(value);
 }

 return "MR-"+parts.join("-");
}

function validId(id){
 return typeof id==="string"&&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function configReady(env){
 return Boolean(
  env.SUPABASE_URL&&
  env.SUPABASE_SECRET_KEY&&
  env.ADMIN_PASSWORD&&
  env.SESSION_SECRET
 );
}

function sessionCookie(token){
 return "mr_admin="+token+
  "; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800";
}

function clearSessionCookie(){
 return "mr_admin=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0";
}

export default {
 async fetch(request,env){
  const url=new URL(request.url);
  const path=url.pathname;
  const method=request.method;

  try{
   // Halaman utama
   if(method==="GET"&&path==="/"){
    return json({
     status:"online",
     service:"MetaRoot Register License",
     version:"3.0"
    });
   }

   // Dashboard admin
   if(method==="GET"&&path==="/admin"){
    return new Response(HTML,{
     headers:{
      "Content-Type":"text/html; charset=UTF-8",
      "Cache-Control":"no-store",
      "X-Content-Type-Options":"nosniff",
      "Referrer-Policy":"no-referrer",
      "Content-Security-Policy":
       "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"
     }
    });
   }

   // Login admin
   if(method==="POST"&&path==="/api/admin-login"){
    if(!env.ADMIN_PASSWORD||!env.SESSION_SECRET){
     return json({error:"Admin configuration incomplete"},500);
    }

    const data=await readBody(request);

    if(!data||typeof data.password!=="string"){
     return json({error:"Invalid request"},400);
    }

    if(data.password!==env.ADMIN_PASSWORD){
     return json({error:"Invalid credentials"},401);
    }

    const token=await createSession(env.SESSION_SECRET);

    return json(
     {success:true},
     200,
     {"Set-Cookie":sessionCookie(token)}
    );
   }

   // Logout admin
   if(method==="POST"&&path==="/api/admin-logout"){
    return json(
     {success:true},
     200,
     {"Set-Cookie":clearSessionCookie()}
    );
   }

   // Pemeriksaan konfigurasi database
   if(!configReady(env)){
    return json({error:"Server configuration incomplete"},500);
   }

   // Aktivasi Register Key dari aplikasi MetaRoot
   if(method==="POST"&&path==="/api/activate-license"){
    const data=await readBody(request);

    if(!data||
       typeof data.key!=="string"||
       typeof data.device_hash!=="string"||
       !/^[a-f0-9]{64}$/i.test(data.device_hash)){
     return json({
      success:false,
      error:"Invalid registration data"
     },400);
    }

    const keyHash=await sha256(data.key.trim().toUpperCase());

    const params=new URLSearchParams({
     select:"id,label,is_active,expires_at,device_hash",
     key_hash:"eq."+keyHash,
     limit:"1"
    });

    const licenses=await db(env,"api_keys?"+params);

    if(!licenses||licenses.length===0){
     return json({success:false,error:"Invalid register key"},403);
    }

    const license=licenses[0];

    if(!license.is_active){
     return json({success:false,error:"License disabled"},403);
    }

    if(license.expires_at&&
       new Date(license.expires_at).getTime()<=Date.now()){
     return json({success:false,error:"License expired"},403);
    }

    if(license.device_hash&&
       license.device_hash!==data.device_hash){
     return json({
      success:false,
      error:"License already bound to another device"
     },403);
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
       device_hash:data.device_hash,
       bound_at:new Date().toISOString()
      })
     });

     if(!updated||updated.length!==1){
      return json({
       success:false,
       error:"Activation conflict. Please retry."
      },409);
     }
    }

    return json({
     success:true,
     activated:true,
     label:license.label||null,
     message:"License activated"
    });
   }

   // Endpoint khusus admin
   const adminRoutes=[
    "/api/create-license",
    "/api/licenses",
    "/api/reset-device",
    "/api/revoke-license"
   ];

   if(adminRoutes.includes(path)){
    if(!env.SESSION_SECRET){
     return json({error:"Session configuration incomplete"},500);
    }

    const authenticated=await verifySession(
     request,
     env.SESSION_SECRET
    );

    if(!authenticated){
     return json({error:"Unauthorized"},401);
    }
   }

   // Generate Register Key
   if(method==="POST"&&path==="/api/create-license"){
    const data=await readBody(request);

    if(!data||
       typeof data.label!=="string"||
       !data.label.trim()||
       data.label.trim().length>80){
     return json({
      error:"Label must be 1-80 characters"
     },400);
    }

    let expiresAt=null;

    if(data.expires_at){
     const date=new Date(data.expires_at);

     if(Number.isNaN(date.getTime())||date.getTime()<=Date.now()){
      return json({error:"Invalid expiration date"},400);
     }

     expiresAt=date.toISOString();
    }

    for(let attempt=0;attempt<3;attempt++){
     const key=generateKey();
     const keyHash=await sha256(key);

     try{
      await db(env,"api_keys",{
       method:"POST",
       headers:{Prefer:"return=minimal"},
       body:JSON.stringify({
        key_hash:keyHash,
        label:data.label.trim(),
        is_active:true,
        expires_at:expiresAt,
        device_hash:null,
        bound_at:null
       })
      });

      return json({success:true,key},201);
     }catch(error){
      if(error instanceof DatabaseError&&error.status===409&&attempt<2){
       continue;
      }
      throw error;
     }
    }

    return json({error:"Could not generate unique key"},500);
   }

   // Daftar lisensi
   if(method==="GET"&&path==="/api/licenses"){
    const params=new URLSearchParams({
     select:"id,label,is_active,expires_at,created_at,device_hash,bound_at",
     order:"created_at.desc"
    });

    const licenses=await db(env,"api_keys?"+params);

    return json({
     success:true,
     licenses:licenses||[]
    });
   }

   // Reset ikatan perangkat
   if(method==="POST"&&path==="/api/reset-device"){
    const data=await readBody(request);

    if(!data||!validId(data.id)){
     return json({error:"Invalid license ID"},400);
    }

    const params=new URLSearchParams({
     id:"eq."+data.id
    });

    const updated=await db(env,"api_keys?"+params,{
     method:"PATCH",
     headers:{Prefer:"return=representation"},
     body:JSON.stringify({
      device_hash:null,
      bound_at:null
     })
    });

    if(!updated||updated.length===0){
     return json({error:"License not found"},404);
    }

    return json({
     success:true,
     message:"Device binding reset"
    });
   }

   // Nonaktifkan lisensi
   if(method==="POST"&&path==="/api/revoke-license"){
    const data=await readBody(request);

    if(!data||!validId(data.id)){
     return json({error:"Invalid license ID"},400);
    }

    const params=new URLSearchParams({
     id:"eq."+data.id
    });

    const updated=await db(env,"api_keys?"+params,{
     method:"PATCH",
     headers:{Prefer:"return=representation"},
     body:JSON.stringify({is_active:false})
    });

    if(!updated||updated.length===0){
     return json({error:"License not found"},404);
    }

    return json({
     success:true,
     message:"License revoked"
    });
   }

   return json({error:"Not found"},404);

  }catch(error){
   console.error("Worker error:",error);

   if(error instanceof DatabaseError){
    return json({error:"Database operation failed"},500);
   }

   return json({error:"Internal server error"},500);
  }
 }
};

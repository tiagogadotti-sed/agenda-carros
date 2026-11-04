// Não armazena páginas autenticadas nem respostas da API no cache.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>new Response('<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width"><title>Sem conexão</title><h1>Você está sem conexão</h1><p>Reconecte-se para consultar a disponibilidade atual e agendar veículos.</p><a href="/">Tentar novamente</a></html>',{headers:{'Content-Type':'text/html; charset=utf-8'}})));});

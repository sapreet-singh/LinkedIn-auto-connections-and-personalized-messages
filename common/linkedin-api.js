(function(global){
  'use strict';

  const DEFAULT_BASE = 'https://localhost:7120';

  const sleep = (ms)=> new Promise(r=> setTimeout(r, ms));
  const isAbs = (u)=> /^https?:\/\//i.test(u);

  class Http {
    constructor(base = DEFAULT_BASE){
      this.base = base;
      this.timeout = 30000;
      this.retries = 0;
      this.headers = { 'Accept': 'application/json, text/plain, */*' };
    }
    setBase(base){ this.base = base || DEFAULT_BASE; return this; }
    setAuthBearer(token){ if (token) this.headers['Authorization'] = `Bearer ${token}`; else delete this.headers['Authorization']; return this; }
    setTimeout(ms){ this.timeout = ms|0; return this; }
    setRetries(n, delayMs){ this.retries = Math.max(0, n|0); this.retryDelay = delayMs || 400; return this; }

    build(u){
      if (!u) return this.base;
      if (isAbs(u)) return u;
      const b = (this.base || '').replace(/\/$/, '');
      const p = String(u).replace(/^\//, '');
      return `${b}/${p}`;
    }

    async req(path, opts={}){
      const url = this.build(path);
      const method = (opts.method||'GET').toUpperCase();
      const headers = Object.assign({}, this.headers, opts.headers||{});
      const controller = new AbortController();
      const id = setTimeout(()=> controller.abort(), opts.timeout || this.timeout);
      const attempts = (Number.isInteger(opts.retries) ? opts.retries : this.retries) + 1;
      let lastErr;
      for (let i=0; i<attempts; i++){
        try {
          const res = await fetch(url, { method, headers, body: opts.body, signal: controller.signal });
          if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
          const ct = res.headers.get('content-type') || '';
          if (ct.includes('application/json')) return await res.json();
          return await res.text();
        } catch (e){
          lastErr = e;
          if (i < attempts - 1){ await sleep(this.retryDelay || 400); continue; }
          throw e;
        } finally {
          clearTimeout(id);
        }
      }
      throw lastErr || new Error('Unknown HTTP error');
    }

    get(path, opts){ return this.req(path, Object.assign({ method: 'GET' }, opts)); }
    post(path, data, opts){
      const headers = Object.assign({ 'Content-Type': 'application/json' }, opts?.headers || {});
      return this.req(path, Object.assign({ method: 'POST', headers, body: data!=null ? JSON.stringify(data) : undefined }, opts));
    }
    put(path, data, opts){
      const headers = Object.assign({ 'Content-Type': 'application/json' }, opts?.headers || {});
      return this.req(path, Object.assign({ method: 'PUT', headers, body: data!=null ? JSON.stringify(data) : undefined }, opts));
    }
    patch(path, data, opts){
      const headers = Object.assign({ 'Content-Type': 'application/json' }, opts?.headers || {});
      return this.req(path, Object.assign({ method: 'PATCH', headers, body: data!=null ? JSON.stringify(data) : undefined }, opts));
    }
    del(path, opts){ return this.req(path, Object.assign({ method: 'DELETE' }, opts)); }
  }

  // Endpoint-specific convenience methods based on your OpenAPI
  function makeLinkedInApi(base){
    const http = new Http(base);

    return {
      config: http,
      message: (dto)=> http.post('/api/linkedin/message', dto),

      profiles: {
        get: ()=> http.get('/api/linkedin/profiles'),
        post: (dto)=> http.post('/api/linkedin/profiles', dto),
      },

      getStatus: ()=> http.get('/api/linkedin/GetStatus'),

      filterPrompt: (dto)=> http.post('/api/linkedin/filter-prompt', dto),

      acceptedRequest: (dto)=> http.post('/api/linkedin/accepted-request', dto),

      getConnection: ()=> http.get('/api/linkedin/Get-Connection'),

      followUp: (dto)=> http.post('/api/linkedin/FollowUp', dto),

      followUpLog: (dto)=> http.post('/api/linkedin/FollowUp-log', dto),

      getAllFollowUp: ()=> http.get('/api/linkedin/GetAll-FollowUp'),

      setAutomation: (id, enabled)=> http.post(`/api/linkedin/${encodeURIComponent(id)}/automation/${String(!!enabled)}`, null),

      inboxReply: (dto)=> http.post('/api/linkedin/InboxReply', dto),
    };
  }

  const LinkedInApi = makeLinkedInApi(DEFAULT_BASE);
  LinkedInApi.make = makeLinkedInApi;

  global.LinkedInApi = LinkedInApi;

})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : window);

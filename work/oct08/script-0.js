
  (()=>{
    const manifest={"id":"./","name":"4J Finance","short_name":"4J Finance","description":"Juntos, mais longe. Seus registros, seus planos, seu espaço.","lang":"pt-BR","start_url":"./","scope":"./","display":"standalone","background_color":"#fffaf0","theme_color":"#2e5372","icons":[{"src":"__4J_ASSET_5__","sizes":"192x192","type":"image/png","purpose":"any"},{"src":"__4J_ASSET_6__","sizes":"512x512","type":"image/png","purpose":"any"},{"src":"__4J_ASSET_6__","sizes":"512x512","type":"image/png","purpose":"maskable"}]};
    const entry=new URL(location.href);
    entry.search='';entry.hash='';
    manifest.id=entry.href;manifest.start_url=entry.href;manifest.scope=new URL('./',entry).href;
    document.getElementById('fourj-embedded-manifest').href='data:application/manifest+json;charset=utf-8,'+encodeURIComponent(JSON.stringify(manifest));
  })();
  
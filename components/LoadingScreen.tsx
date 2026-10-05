'use client';

export default function LoadingScreen() {
  return (
    <main style={styles.page} aria-label="Loading">
      <div style={styles.glow} />
      <div style={styles.cardWrap}>
      <svg style={styles.cardRing} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <rect x="1.5" y="1.5" width="97" height="97" rx="6" fill="none" stroke="#e7ebef" strokeWidth="3" vectorEffect="non-scaling-stroke" />
        <rect x="1.5" y="1.5" width="97" height="97" rx="6" fill="none" stroke="#ff444f" strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" pathLength="100" strokeDasharray="22 78" style={{animation:'mh-loading-border 1.6s linear infinite'}} />
      </svg>
      <section style={styles.card}>
        <svg style={styles.logo} viewBox="-30 -30 572 572" role="img" aria-label="MozHyper">
          <rect x="-12" y="-12" width="536" height="536" rx="124" fill="none" stroke="#e7ebef" strokeWidth="14" />
          <rect x="-12" y="-12" width="536" height="536" rx="124" fill="none" stroke="#ff444f" strokeWidth="14" strokeLinecap="round" pathLength="100" strokeDasharray="22 78" style={{animation:'mh-loading-border 1.4s linear infinite'}} />
          <rect width="512" height="512" rx="112" fill="#ff444f" />
          <g transform="translate(256 256) scale(0.82) translate(-256 -285)">
            <path d="M190 249 L190 132 L256 197 L322 132 L322 249" fill="none" stroke="#fff" strokeWidth="26" strokeLinejoin="miter" />
            <polygon points="88,424 146,388 190,406 249,351 300,369 358,322 424,285 424,439 88,439" fill="#fff" fillOpacity=".2" />
            <polyline points="88,424 146,388 190,406 249,351 300,369 358,322 424,285" fill="none" stroke="#fff" strokeWidth="11" strokeLinejoin="round" strokeLinecap="round" />
            <circle cx="424" cy="285" r="33" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="4" />
            <circle cx="424" cy="285" r="20" fill="#fff" />
          </g>
        </svg>
        <div style={styles.brand}>Moz<span>Hyper</span></div>
        <div style={styles.sub}>DIGITS TRADING</div>
        <div style={styles.spinner} aria-hidden="true">
          <span style={styles.ring} />
          <span style={styles.dot} />
        </div>
        <div style={styles.title}>A preparar a plataforma</div>
        <div style={styles.detail}>A verificar a sua sessão...</div>
      </section>
      </div>
      <style>{`@keyframes mh-loading-spin { to { transform: rotate(360deg); } } @keyframes mh-loading-border { to { stroke-dashoffset: -100; } } @keyframes mh-loading-cardspin { to { transform: rotate(360deg); } }`}</style>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page:{minHeight:'100dvh',display:'flex',alignItems:'center',justifyContent:'center',position:'relative',overflow:'hidden',background:'#fff',color:'#171717',fontFamily:"'IBM Plex Sans',sans-serif"},
  glow:{position:'absolute',width:260,height:260,borderRadius:'50%',background:'rgba(255,68,79,.07)',filter:'blur(55px)'},
  cardWrap:{position:'relative',zIndex:1,width:'min(86vw,330px)',borderRadius:19,padding:3,boxSizing:'border-box'},
  cardRing:{position:'absolute',inset:0,width:'100%',height:'100%',display:'block'},
  card:{position:'relative',zIndex:1,width:'100%',padding:'34px 26px',borderRadius:16,textAlign:'center',background:'#fff',boxShadow:'0 20px 60px rgba(20,30,40,.10)'},
  logo:{width:66,height:66,margin:'0 auto 10px',display:'block'},
  brand:{fontSize:25,fontWeight:800,letterSpacing:'-.04em'},
  sub:{marginTop:4,color:'#858c93',fontSize:8,fontWeight:700,letterSpacing:'.18em'},
  spinner:{width:42,height:42,margin:'28px auto 18px',position:'relative'},
  ring:{position:'absolute',inset:0,border:'3px solid #e7ebef',borderTopColor:'#ff444f',borderRadius:'50%',animation:'mh-loading-spin 0.8s linear infinite'},
  dot:{position:'absolute',width:6,height:6,left:18,top:18,borderRadius:'50%',background:'#ff444f'},
  title:{fontSize:13,fontWeight:700},
  detail:{marginTop:6,color:'#747b82',fontSize:10},
};

'use client';

export default function LoadingScreen() {
  return (
    <main style={styles.page} aria-label="Loading">
      <div style={styles.glow} />
      <div style={styles.cardWrap}>
      <svg style={styles.cardRing} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <rect x="2.5" y="2.5" width="95" height="95" rx="6" fill="none" stroke="#e7ebef" strokeWidth="3.5" vectorEffect="non-scaling-stroke" />
        <rect className="mh-loading-border-segment" x="2.5" y="2.5" width="95" height="95" rx="6" fill="none" stroke="#ff303f" strokeWidth="3.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" pathLength="100" strokeDasharray="26 74" />
      </svg>
      <section style={styles.card}>
        <img src="/api/public-assets/icon.svg?v=5" alt="MozHyper" style={styles.logo} />
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
      <style>{`@keyframes mh-loading-spin { to { transform: rotate(360deg); } } @keyframes mh-loading-border { to { stroke-dashoffset: -100; } } @keyframes mh-loading-cardspin { to { transform: rotate(360deg); } } .mh-loading-border-segment { animation: mh-loading-border 1.35s linear infinite; } @media (prefers-reduced-motion: reduce) { .mh-loading-border-segment { animation-duration: 3s; } }`}</style>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page:{minHeight:'100dvh',display:'flex',alignItems:'center',justifyContent:'center',position:'relative',overflow:'hidden',background:'#fff',color:'#171717',fontFamily:"'IBM Plex Sans',sans-serif"},
  glow:{position:'absolute',width:260,height:260,borderRadius:'50%',background:'rgba(255,68,79,.07)',filter:'blur(55px)'},
  cardWrap:{position:'relative',zIndex:1,width:'min(86vw,330px)',borderRadius:19,padding:5,boxSizing:'border-box'},
  cardRing:{position:'absolute',inset:0,width:'100%',height:'100%',display:'block',zIndex:2,pointerEvents:'none',overflow:'visible'},
  card:{position:'relative',zIndex:1,width:'100%',padding:'34px 26px',borderRadius:16,textAlign:'center',background:'#fff',boxShadow:'0 20px 60px rgba(20,30,40,.10)'},
  logo:{width:110,height:110,objectFit:'contain',margin:'0 auto 10px',display:'block'},
  brand:{fontSize:25,fontWeight:800,letterSpacing:'-.04em'},
  sub:{marginTop:4,color:'#858c93',fontSize:8,fontWeight:700,letterSpacing:'.18em'},
  spinner:{width:42,height:42,margin:'28px auto 18px',position:'relative'},
  ring:{position:'absolute',inset:0,border:'3px solid #e7ebef',borderTopColor:'#ff444f',borderRadius:'50%',animation:'mh-loading-spin 0.8s linear infinite'},
  dot:{position:'absolute',width:6,height:6,left:18,top:18,borderRadius:'50%',background:'#ff444f'},
  title:{fontSize:13,fontWeight:700},
  detail:{marginTop:6,color:'#747b82',fontSize:10},
};

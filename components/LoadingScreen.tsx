'use client';

export default function LoadingScreen() {
  return (
    <main style={styles.page} aria-label="Loading">
      <div style={styles.glow} />
      <section style={styles.card}>
        <div style={styles.logo}>M</div>
        <div style={styles.brand}>Moz<span>Hyper</span></div>
        <div style={styles.sub}>DIGITS TRADING</div>
        <div style={styles.spinner} aria-hidden="true">
          <span style={styles.ring} />
          <span style={styles.dot} />
        </div>
        <div style={styles.title}>A preparar a plataforma</div>
        <div style={styles.detail}>A verificar a sua sessão...</div>
      </section>
      <style>{`@keyframes mh-loading-spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page:{minHeight:'100dvh',display:'flex',alignItems:'center',justifyContent:'center',position:'relative',overflow:'hidden',background:'#fff',color:'#171717',fontFamily:"'IBM Plex Sans',sans-serif"},
  glow:{position:'absolute',width:260,height:260,borderRadius:'50%',background:'rgba(255,68,79,.07)',filter:'blur(55px)'},
  card:{position:'relative',zIndex:1,width:'min(86vw,330px)',padding:'34px 26px',borderRadius:16,textAlign:'center',background:'rgba(255,255,255,.96)',border:'1px solid #e3e7eb',boxShadow:'0 20px 60px rgba(20,30,40,.10)'},
  logo:{width:52,height:52,margin:'0 auto 12px',display:'flex',alignItems:'center',justifyContent:'center',borderRadius:12,background:'#ff444f',color:'#fff',fontSize:25,fontWeight:800},
  brand:{fontSize:25,fontWeight:800,letterSpacing:'-.04em'},
  sub:{marginTop:4,color:'#858c93',fontSize:8,fontWeight:700,letterSpacing:'.18em'},
  spinner:{width:42,height:42,margin:'28px auto 18px',position:'relative'},
  ring:{position:'absolute',inset:0,border:'3px solid #e7ebef',borderTopColor:'#ff444f',borderRadius:'50%',animation:'mh-loading-spin 0.8s linear infinite'},
  dot:{position:'absolute',width:6,height:6,left:18,top:18,borderRadius:'50%',background:'#ff444f'},
  title:{fontSize:13,fontWeight:700},
  detail:{marginTop:6,color:'#747b82',fontSize:10},
};

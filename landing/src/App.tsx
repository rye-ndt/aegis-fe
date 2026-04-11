import { useEffect } from 'react';
import { Navbar } from './sections/Navbar';
import { Hero } from './sections/Hero';
import { Problem } from './sections/Problem';
import { HowItWorks } from './sections/HowItWorks';
import { Features } from './sections/Features';
import { ForDevelopers } from './sections/ForDevelopers';
import { Architecture } from './sections/Architecture';
import { Footer } from './sections/Footer';

function App() {
  useEffect(() => {
    document.documentElement.style.scrollBehavior = 'smooth';
    return () => { document.documentElement.style.scrollBehavior = 'auto'; };
  }, []);

  return (
    <div className="bg-[#0f0f1a] text-white font-sans min-h-screen selection:bg-violet-500/30 overflow-hidden relative">
      <Navbar />
      <main>
        <Hero />
        <Problem />
        <HowItWorks />
        <Features />
        <ForDevelopers />
        <Architecture />
      </main>
      <Footer />
    </div>
  );
}

export default App;

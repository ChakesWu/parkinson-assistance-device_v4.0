import { FooterDemo } from "@/components/ui/footer-demo";
import HeroSection from "@/components/ui/hero-section";
import HeroSectionOld from "@/components/ui/hero-section-old";
import { AnimatedDock } from "@/components/ui/animated-dock";
import AnimatedCardDemo from "@/components/ui/animated-card-demo";
import ParkinsonTestimonials from "@/components/ui/parkinson-testimonials";
import SimpleLightweightIndicator from "@/components/device/SimpleLightweightIndicator";
import { Home, Activity, Book, Settings, Brain, Gamepad2 } from 'lucide-react';



export default function HomePage() {
  const dockItems = [
    {
      link: "/",
      Icon: <Home size={22} />,
    },
    {
      link: "/device",
      Icon: <Activity size={22} />,
    },
    {
      link: "/rehab-game",
      Icon: <Gamepad2 size={22} />,
    },
    {
      link: "/records",
      Icon: <Book size={22} />,
    },
    {
      link: "/ai-analysis",
      Icon: <Brain size={22} />,
    },
    {
      link: "/settings",
      Icon: <Settings size={22} />,
    }
  ];

  return (
    <div className="relative">
      {/* Lightweight connection status indicator */}
      <div className="fixed top-4 right-4 z-50 bg-white dark:bg-neutral-800 rounded-lg p-3 shadow-lg">
        <SimpleLightweightIndicator />
      </div>

      <div className="min-h-screen">
        <HeroSection
          title=""
          topHref="/about"
          subtitle={{
            regular: "Parkinson's Hand Training\nDesign Based on LSTM and CNN\nHybrid Model",
            gradient: "",
          }}
          description=""
          ctaText="Get Started"
          ctaHref="/device"
          backgroundImageUrl="/ai_model/Replicate-Web-Page.png"
          gridOptions={{ angle: 65, opacity: 0.0, cellSize: 60 }}
          className=""
        />


        {/* Annual Parkinson's Trend Analysis (moved up to slightly overlap with blue area, not blocking patient testimonials) */}
        <section className="relative z-10 -mt-16 md:-mt-24 max-w-[80vw] mx-auto px-6 md:px-10 pb-12 md:pb-16">
          {/* Dynamic tree diagram (using AnimatedCardDemo, not blocking patient testimonials) */}
          <div className="w-full flex items-center justify-center">
            <AnimatedCardDemo />
          </div>
        </section>

        {/* Use new animated Dock */}
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50">
          <AnimatedDock items={dockItems} />
        </div>
      </div>

      {/* Patient testimonials section */}
      <ParkinsonTestimonials />

      {/* Footer */}
      <FooterDemo />
    </div>
  );
}

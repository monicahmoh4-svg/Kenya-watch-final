import { HeroSection } from '@/components/HeroSection';
import { FeaturesGrid } from '@/components/FeaturesGrid';
import { LiveDashboardPreview } from '@/components/LiveDashboardPreview';
import { HowItWorks } from '@/components/HowItWorks';
import { CTASection } from '@/components/CTASection';

export default function Home() {
  return (
    <main className="bg-slate-950 text-white overflow-hidden">
      <HeroSection />
      <FeaturesGrid />
      <LiveDashboardPreview />
      <HowItWorks />
      <CTASection />
    </main>
  );
}

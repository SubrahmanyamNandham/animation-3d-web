import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import AboutSection from "@/components/AboutSection";

export default function Home() {
  return (
    <main>
      <section className="flex h-[100svh] max-h-[1080px] flex-col">
        <Navbar />
        <div className="min-h-0 flex-1">
          <Hero />
        </div>
      </section>
      <AboutSection />
    </main>
  );
}

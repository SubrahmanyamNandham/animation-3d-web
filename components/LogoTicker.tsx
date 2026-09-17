import Image from "next/image";
import { assets } from "@/lib/assets";

const logos = [
  { src: assets.clientFeatherdev, alt: "FeatherDev" },
  { src: assets.clientSpherule, alt: "Spherule" },
  { src: assets.clientBoltshift, alt: "Boltshift" },
  { src: assets.clientGlobalbank, alt: "GlobalBank" },
  { src: assets.clientEpicurious, alt: "Epicurious" },
  { src: assets.clientIkigai, alt: "Ikigai Labs" },
];

function LogoGroup() {
  return (
    <div className="flex shrink-0 items-center gap-14">
      {logos.map((logo) => (
        <Image
          key={logo.alt}
          src={logo.src}
          alt={logo.alt}
          width={120}
          height={24}
          className="h-6 w-auto object-contain opacity-[0.55]"
        />
      ))}
    </div>
  );
}

export default function LogoTicker() {
  return (
    <div className="marquee-mask w-full overflow-hidden">
      <div className="marquee-track flex w-max items-center gap-14">
        <LogoGroup />
        <LogoGroup />
      </div>
    </div>
  );
}

import Image from "next/image";
import { assets } from "@/lib/assets";

const navLinks = ["Home", "About", "Services", "Case Studies", "Stories"];

export default function Navbar() {
  return (
    <nav className="relative z-50 flex h-[52px] w-full shrink-0 items-center justify-between bg-white px-5 sm:px-[clamp(20px,4.2vw,60px)]">
      <div className="flex items-center gap-2">
        <Image
          src={assets.logoFlorma}
          alt="Florma"
          width={20}
          height={20}
          className="h-5 w-auto"
        />
        <span className="text-base font-medium text-black">Florma</span>
      </div>

      {/* Source only hides these below md — no hamburger/mobile menu is invented */}
      <div className="hidden flex-1 items-center justify-evenly md:flex">
        {navLinks.map((link) => (
          <a
            key={link}
            href={`#${link.toLowerCase().replace(/\s+/g, "-")}`}
            className="text-sm font-normal text-black opacity-100 transition-opacity duration-200 ease-out hover:opacity-60"
          >
            {link}
          </a>
        ))}
      </div>
    </nav>
  );
}

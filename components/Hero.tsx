"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import LogoTicker from "./LogoTicker";
import CaseCard from "./CaseCard";
import { assets } from "@/lib/assets";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: "easeOut", delay },
  }),
};

export default function Hero() {
  return (
    <div className="relative isolate mx-5 mb-5 h-full overflow-hidden rounded-[clamp(24px,2.8vw,40px)]">
      {/* Background video */}
      <video
        className="absolute inset-0 h-full w-full object-cover object-center"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster={assets.thumbnail}
      >
        <source src={assets.heroVideo} type="video/mp4" />
      </video>

      {/* Flat readability wash over the video */}
      <div className="absolute inset-0 bg-black/[0.28]" />

      {/* Bottom-heavy gradient so the headline/copy stay legible */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 40%, rgba(0,0,0,0) 70%)",
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex h-full flex-col justify-between px-6 py-8 sm:px-[clamp(20px,4.2vw,60px)] sm:py-[clamp(24px,3vw,56px)]">
        {/* Giant wordmark + floating trust badge */}
        <motion.div
          className="relative flex flex-col md:block"
          initial="hidden"
          animate="show"
          custom={0.1}
          variants={fadeUp}
        >
          <h1 className="-ml-[10px] font-normal leading-[100%] tracking-[-0.04em] text-white text-[clamp(64px,13.2vw,190px)]">
            Florma
            <span className="relative -top-[0.5em] ml-1 align-super text-[0.27em] font-normal">
              ®
            </span>
          </h1>

          <div className="mt-6 flex flex-col gap-3 md:absolute md:right-0 md:top-1/2 md:mt-0 md:w-[291px] md:-translate-y-1/2">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex items-center">
                <div className="relative h-7 w-7 overflow-hidden rounded-full ring-2 ring-white">
                  <Image
                    src={assets.avatar1}
                    alt=""
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="relative -ml-2 h-7 w-7 overflow-hidden rounded-full ring-2 ring-white">
                  <Image
                    src={assets.avatar2}
                    alt=""
                    fill
                    className="object-cover"
                  />
                </div>
              </div>
              <span className="text-sm font-normal text-white">
                Trusted by teams worldwide
              </span>
            </div>
          </div>
        </motion.div>

        {/* Subtitle + case card, then the logo ticker beneath */}
        <div className="flex flex-col gap-10">
          <div className="flex flex-col items-start gap-8 md:flex-row md:items-end md:justify-between">
            <motion.div
              className="flex w-full flex-col md:w-auto"
              initial="hidden"
              animate="show"
              custom={0.25}
              variants={fadeUp}
            >
              <p className="mb-5 w-full text-base font-normal text-white md:w-[420px] lg:w-[560px]">
                We build immersive experiences for businesses and agencies
                who want to reach a greater audience
              </p>
            </motion.div>

            <motion.div
              initial="hidden"
              animate="show"
              custom={0.4}
              variants={fadeUp}
            >
              <CaseCard />
            </motion.div>
          </div>

          <motion.div
            initial="hidden"
            animate="show"
            custom={0.55}
            variants={fadeUp}
          >
            <LogoTicker />
          </motion.div>
        </div>
      </div>
    </div>
  );
}

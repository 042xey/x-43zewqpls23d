import { useState } from "react";

const SVG_GEN_URL= "https://37996642-90e0-4318-b5e1-1991ac9bd88d-00-112ya9isuoh7z.picard.replt.dev/";

interface SVGGeneratorProps {
    isActive: boolean;
}

export default function
SVGGeneratorTab({ isActive }:
SVGGeneratorProps) {
  const [hasLoaded, setHasLoaded] =
useState(false);

  if (!isActive) {
    return null;
  }

  return (
    <div style={{ width: "100%", height: "100vh", position: "relative" }}>
      {!hasLoaded && (
        <div 
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            frontFamily: "sans-serif",
            color: "#64748b",
          }}
        >
          Loading SVG Generator...
        </div>
      )}
      <iframe
        src={SVG_GEN_URL}
        title="SVG R Generator"
        onLoad={() => setHasLoaded(true)}
        allow="clipboard-write"
        style={{
          width: "100%",
          height: "100%",
          border: "0",
          display: hasLoaded ? "block" : "none"
        }}
      />
    </div>
  );
}
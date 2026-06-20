import type { ProcessedImage } from "../../shared/types";

import { estimateDataUrlBytes } from "../../shared/lib/mediaLimits";



const DEFAULT_BOUNDS = { x0: 0.12, y0: 0.08, x1: 0.88, y1: 0.96 };

const DEFAULT_FOCUS = {

  onPrimarySubject: true,

  centering: "centered" as const,

  aestheticScore: 0.75,

  compositionNotes: "",

};



const DEFAULT_CENTER = { x: 50, y: 50 };



/**

 * Showcase upload — no analysis API. Original data URLs are kept for shape-aware raster crop.

 */

export async function processShowcaseQuickUpload(

  sourceImages: string[],

  sequenceStart = 0

): Promise<ProcessedImage[]> {

  const results: ProcessedImage[] = [];



  for (let i = 0; i < sourceImages.length; i++) {

    const source = sourceImages[i]!;

    results.push({

      id: Date.now() + i,

      url: source,

      preparedUrl: source,

      preCropSourceUrl: source,

      originalUrl: source,

      label: `Upload ${i + 1}`,

      aiSuggestedCategory: "portrait",

      categoryConfidence: 1,

      center: DEFAULT_CENTER,

      focus: DEFAULT_FOCUS,

      preprocessMode: "original",

      subject: {

        requestedTarget: "person",

        detectedLabel: "person",

        detected: true,

        confidence: 1,

        bounds: DEFAULT_BOUNDS,

      },

      depth: {

        gridSize: 8,

        subjectDepth: 0.75,

        values: Array.from({ length: 64 }, () => 0.75),

      },

      byteSize: estimateDataUrlBytes(source),

      sequenceOrder: sequenceStart + i,

    });

  }



  return results;

}



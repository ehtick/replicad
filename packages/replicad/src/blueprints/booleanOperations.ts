import { Geom2dAPI_InterCurveCurve } from "replicad-opencascadejs";

import { getOC } from "../oclib.js";
import zip from "../utils/zip";
import { Point2D, Curve2D, samePoint } from "../lib2d";

import Blueprint from "./Blueprint";
import Blueprints from "./Blueprints";
import { organiseBlueprints } from "./lib";

const curveMidPoint = (curve: Curve2D) => {
  // (lp - fp) / 2 + fp
  const midParameter = (curve.lastParameter + curve.firstParameter) / 2;
  return curve.value(midParameter);
};

const rotateToStartAt = (curves: Curve2D[], point: Point2D) => {
  const startIndex = curves.findIndex((curve: Curve2D) => {
    return samePoint(point, curve.firstPoint);
  });

  const start = curves.slice(0, startIndex);
  const end = curves.slice(startIndex);

  return end.concat(start);
};

function* createSegmentOnPoints(
  curves: Curve2D[],
  allIntersections: Point2D[]
) {
  const endsAtIntersection = (curve: Curve2D) => {
    return !!allIntersections.find((intersection) => {
      return samePoint(intersection, curve.lastPoint);
    });
  };

  let currentCurves = [];
  for (const curve of curves) {
    currentCurves.push(curve);
    if (endsAtIntersection(curve)) {
      yield currentCurves;
      currentCurves = [];
    }
  }
  if (currentCurves.length) yield currentCurves;
}

function* pointsIteration(
  intersector: Geom2dAPI_InterCurveCurve
): Generator<Point2D> {
  const nPoints = intersector.NbPoints();
  if (!nPoints) return;

  for (let i = 1; i <= nPoints; i++) {
    const point = intersector.Point(i);
    yield [point.X(), point.Y()];
  }
}

function* commonSegmentsIteration(
  intersector: Geom2dAPI_InterCurveCurve
): Generator<Curve2D> {
  const nSegments = intersector.NbSegments();
  if (!nSegments) return;

  const oc = getOC();

  for (let i = 1; i <= nSegments; i++) {
    const h1 = new oc.Handle_Geom2d_Curve_1();
    const h2 = new oc.Handle_Geom2d_Curve_1();
    intersector.Segment(i, h1, h2);
    yield new Curve2D(h1);
    h2.delete();
  }
}

type Segment = Array<Curve2D>;
type IntersectionSegment = [Segment, Segment | "same"];

const startOfSegment = (s: Segment): Point2D => {
  return s[0].firstPoint;
};

const endOfSegment = (s: Segment): Point2D => {
  return s[s.length - 1].lastPoint;
};

const reverseSegment = (segment: Segment) => {
  segment.reverse();
  segment.forEach((curve) => curve.reverse());
  return segment;
};

const reverseSegments = (s: Segment[]) => {
  s.reverse();
  s.forEach(reverseSegment);
  return s;
};

const intersectCurves = (first: Curve2D, second: Curve2D) => {
  const oc = getOC();
  const intersector = new oc.Geom2dAPI_InterCurveCurve_1();

  let intersections;
  let commonSegments;

  try {
    intersector.Init_1(first.wrapped, second.wrapped, 1e-6);

    intersections = Array.from(pointsIteration(intersector));
    commonSegments = Array.from(commonSegmentsIteration(intersector));
  } catch (e) {
    throw new Error("Intersections failed between curves");
  } finally {
    intersector.delete();
  }

  const commonSegmentsPoints = commonSegments.flatMap((c) => [
    c.firstPoint,
    c.lastPoint,
  ]);

  return { intersections, commonSegments, commonSegmentsPoints };
};

/* When two shape intersect we cut them into segments between the intersection
 * points.
 *
 * This function returs the list of segments that have the same start and end
 * at the same intersection points or null if there is no interection.
 *
 * The function assumes that the blueprints are closed
 */
function blueprintsIntersectionSegments(
  first: Blueprint,
  second: Blueprint
): IntersectionSegment[] | null {
  // For each curve of each blueprint we figure out where the intersection
  // points are.
  const allIntersections: Point2D[] = [];
  const allCommonSegments: Curve2D[] = [];

  const firstCurvePoints: Point2D[][] = new Array(first.curves.length)
    .fill(0)
    .map(() => []);
  const secondCurvePoints: Point2D[][] = new Array(second.curves.length)
    .fill(0)
    .map(() => []);

  first.curves.forEach((thisCurve, firstIndex) => {
    second.curves.forEach((otherCurve, secondIndex) => {
      const { intersections, commonSegments, commonSegmentsPoints } =
        intersectCurves(thisCurve, otherCurve);

      allIntersections.push(...intersections);
      firstCurvePoints[firstIndex].push(...intersections);
      secondCurvePoints[secondIndex].push(...intersections);

      allCommonSegments.push(...commonSegments);
      allIntersections.push(...commonSegmentsPoints);
      firstCurvePoints[firstIndex].push(...commonSegmentsPoints);
      secondCurvePoints[secondIndex].push(...commonSegmentsPoints);
    });
  });

  if (!allIntersections.length) return null;

  // We further split the curves at the intersections
  const cutCurve = ([curve, intersections]: [
    Curve2D,
    Point2D[]
  ]): Curve2D[] => {
    if (!intersections.length) return [curve];
    return curve.splitAt(intersections);
  };
  let firstCurveSegments = zip([first.curves, firstCurvePoints] as [
    Curve2D[],
    Point2D[][]
  ]).flatMap(cutCurve);

  let secondCurveSegments = zip([second.curves, secondCurvePoints] as [
    Curve2D[],
    Point2D[][]
  ]).flatMap(cutCurve);

  const commonSegmentsPoints = allCommonSegments.map((c) => [
    c.firstPoint,
    c.lastPoint,
  ]);

  const startAt = commonSegmentsPoints.length
    ? commonSegmentsPoints[0][0]
    : allIntersections[0];

  // We align the beginning of the curves
  firstCurveSegments = rotateToStartAt(firstCurveSegments, startAt);
  secondCurveSegments = rotateToStartAt(secondCurveSegments, startAt);

  // We group curves in segments
  let firstIntersectedSegments = Array.from(
    createSegmentOnPoints(firstCurveSegments, allIntersections)
  );
  let secondIntersectedSegments = Array.from(
    createSegmentOnPoints(secondCurveSegments, allIntersections)
  );

  if (
    allCommonSegments.length > 0 &&
    firstIntersectedSegments[0].length !== 1
  ) {
    firstIntersectedSegments = reverseSegments(firstIntersectedSegments);
  }

  if (
    !samePoint(
      endOfSegment(secondIntersectedSegments[0]),
      endOfSegment(firstIntersectedSegments[0])
    ) ||
    (allCommonSegments.length > 0 && secondIntersectedSegments[0].length !== 1)
  ) {
    secondIntersectedSegments = reverseSegments(secondIntersectedSegments);
  }

  return zip([firstIntersectedSegments, secondIntersectedSegments]).map(
    ([first, second]) => {
      //if (first.length !== 1 || second.length !== 1) return [first, second];

      const currentStart = startOfSegment(first);
      const currentEnd = endOfSegment(first);

      if (
        commonSegmentsPoints.find(([startPoint, endPoint]) => {
          return (
            (samePoint(startPoint, currentStart) &&
              samePoint(endPoint, currentEnd)) ||
            (samePoint(startPoint, currentEnd) &&
              samePoint(startPoint, currentStart))
          );
        })
      ) {
        return [first, "same"];
      }
      return [first, second];
    }
  );
}

const splitPaths = (curves: Curve2D[]) => {
  const startPoints = curves.map((c) => c.firstPoint);
  let endPoints = curves.map((c) => c.lastPoint);
  endPoints = endPoints.slice(-1).concat(endPoints.slice(0, -1));

  const discontinuities = zip([startPoints, endPoints])
    .map(([startPoint, endPoint], index) => {
      if (!samePoint(startPoint, endPoint)) {
        return index;
      }
      return null;
    })
    .filter((f) => f !== null) as number[];

  if (!discontinuities) return [curves];

  const paths = zip([
    discontinuities.slice(0, -1),
    discontinuities.slice(1),
  ]).map(([start, end]) => {
    return curves.slice(start, end);
  });

  let lastPath = curves.slice(discontinuities[discontinuities.length - 1]);
  if (discontinuities[0] !== 0) {
    lastPath = lastPath.concat(curves.slice(0, discontinuities[0]));
  }
  paths.push(lastPath);

  return paths;
};

function booleanOperation(
  first: Blueprint,
  second: Blueprint,
  {
    firstInside,
    secondInside,
  }: {
    firstInside: "keep" | "remove";
    secondInside: "keep" | "remove";
  }
): Blueprint | Blueprints {
  const segments = blueprintsIntersectionSegments(first, second);

  // The case where we have no intersections
  if (!segments) {
    const firstBlueprintPoint = curveMidPoint(first.curves[0]);
    const firstCurveInSecond = second.isInside(firstBlueprintPoint);

    const secondBlueprintPoint = curveMidPoint(second.curves[0]);
    const secondCurveInFirst = second.isInside(secondBlueprintPoint);

    const toKeep = [];

    if (firstCurveInSecond && firstInside === "remove") {
      toKeep.push(first);
    }
    if (!firstCurveInSecond && firstInside === "remove") {
      toKeep.push(first);
    }
    if (secondCurveInFirst && secondInside === "keep") {
      toKeep.push(second);
    }
    if (!secondCurveInFirst && secondInside === "keep") {
      toKeep.push(second);
    }

    if (toKeep.length === 1) return toKeep[0];
    return organiseBlueprints(toKeep);
  }

  let lastWasSame: null | Segment = null;
  let segmentsIn: number | null = null;

  const s = segments.flatMap(([firstSegment, secondSegment]) => {
    let segments: Segment = [];
    let segmentsOut = 0;

    // When two segments are on top of each other we base our decision on the
    // fact that every point should have one segment entering, and one going
    // out.
    if (secondSegment === "same") {
      if (segmentsIn === 1) {
        segmentsIn = 1;
        return [...firstSegment];
      }

      if (segmentsIn === 2) {
        segmentsIn = 0;
        return [];
      }

      if (segmentsIn === null) {
        if (!lastWasSame) lastWasSame = firstSegment;
        else lastWasSame = [...lastWasSame, ...firstSegment];
        return [];
      }

      console.error("weird situation");
      return [];
    }

    // Every segment is kept or removed according to the fact that it is within
    // or not of the other closed blueprint

    const firstSegmentPoint = curveMidPoint(firstSegment[0]);
    const firstSegmentInSecondShape = second.isInside(firstSegmentPoint);
    if (
      (firstInside === "keep" && firstSegmentInSecondShape) ||
      (firstInside === "remove" && !firstSegmentInSecondShape)
    ) {
      segmentsOut += 1;
      segments.push(...firstSegment);
    }

    const secondSegmentPoint = curveMidPoint(secondSegment[0]);
    const secondSegmentInFirstShape = first.isInside(secondSegmentPoint);
    if (
      (secondInside === "keep" && secondSegmentInFirstShape) ||
      (secondInside === "remove" && !secondSegmentInFirstShape)
    ) {
      // When there are only two segments we cannot know if we are in the
      // same until here - so it is possible that they are mismatched.
      if (segmentsOut === 1) {
        secondSegment.reverse();
        secondSegment.forEach((s) => s.reverse());
      }
      segmentsOut += 1;
      segments.push(...secondSegment);
    }

    // This is the case where the information about the segments entering the
    // previous node where not known and no segment was selected
    if (segmentsIn === null && segmentsOut === 1 && lastWasSame) {
      segments = [...lastWasSame, ...segments];
    }

    segmentsIn = segmentsOut;
    lastWasSame = null;

    return segments;
  });

  // It is possible to have more than one resulting out blueprint, we make sure
  // to split them
  const paths = splitPaths(s).map((b) => new Blueprint(b));

  if (paths.length === 1) return paths[0];
  return organiseBlueprints(paths);
}

export const fuseBlueprints = (
  first: Blueprint,
  second: Blueprint
): Blueprint | Blueprints => {
  return booleanOperation(first, second, {
    firstInside: "remove",
    secondInside: "remove",
  });
};

export const cutBlueprints = (
  first: Blueprint,
  second: Blueprint
): Blueprint | Blueprints => {
  return booleanOperation(first, second, {
    firstInside: "remove",
    secondInside: "keep",
  });
};

export const intersectBlueprints = (
  first: Blueprint,
  second: Blueprint
): Blueprint | Blueprints => {
  return booleanOperation(first, second, {
    firstInside: "keep",
    secondInside: "keep",
  });
};

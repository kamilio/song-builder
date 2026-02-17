/**
 * Shot detail page.
 *
 * Route: /video/scripts/:id/:shotId
 *
 * US-067: Sub-routes and breadcrumb navigation.
 *
 * This is a thin wrapper that renders VideoScriptView. VideoScriptView detects
 * the :shotId URL param via useParams and auto-activates Shot mode for the
 * matching shot. Non-existent shotIds redirect to /video/scripts/:id.
 */

import { ErrorBoundary } from "@/shared/components/ErrorBoundary";
import VideoScriptViewImpl from "@/video/pages/VideoScriptView";

function VideoShotViewInner() {
  // VideoScriptView reads both :id and :shotId from useParams internally.
  // When :shotId is present, it enters Shot mode for that shot.
  return <VideoScriptViewImpl />;
}

export default function VideoShotView() {
  return (
    <ErrorBoundary>
      <VideoShotViewInner />
    </ErrorBoundary>
  );
}

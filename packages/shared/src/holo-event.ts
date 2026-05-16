export interface HoloEvent {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceMeta {
  events: HoloEvent[];
  activeEventId: string;
}

export interface CreateEventRequest {
  name: string;
  description?: string;
}

export interface CategoryAssignmentMap {
  [imageId: string]: { userCategory?: string };
}

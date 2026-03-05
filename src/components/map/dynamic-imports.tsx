import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"

function MapSkeleton({ height = "200px" }: { height?: string }) {
  return <Skeleton className="w-full rounded-md" style={{ height }} />
}

export const DynamicLocationPicker = dynamic(
  () => import("./location-picker").then((m) => m.LocationPicker),
  { ssr: false, loading: () => <MapSkeleton /> }
)

export const DynamicLocationPickerModal = dynamic(
  () => import("./location-picker-modal").then((m) => m.LocationPickerModal),
  { ssr: false }
)

export const DynamicCustomerMap = dynamic(
  () => import("./customer-map").then((m) => m.CustomerMap),
  { ssr: false, loading: () => <MapSkeleton height="500px" /> }
)

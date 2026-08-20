import { initialBuildingsForApp } from "@/lib/initial-data";
import BuildingDetailClient from "./building-client";

export function generateStaticParams() { return initialBuildingsForApp.map((building) => ({ id: building.id })); }
export default function BuildingPage() { return <BuildingDetailClient />; }

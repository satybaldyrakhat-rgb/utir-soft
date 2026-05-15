// Lucide icon palette used by the custom-module builder (B.2).
// Pick any of these by string id; the corresponding component is rendered.
import {
  Box, Briefcase, Truck, Wrench, Hammer, Layers, Package, Folder,
  FileText, Phone, Map, MapPin, Calendar, DollarSign, ShoppingBag,
  Users, Star, Heart, Tag, Bookmark, Activity, Clipboard,
} from 'lucide-react';

export const CUSTOM_ICON_MAP: Record<string, any> = {
  box: Box,
  briefcase: Briefcase,
  truck: Truck,
  wrench: Wrench,
  hammer: Hammer,
  layers: Layers,
  package: Package,
  folder: Folder,
  file: FileText,
  phone: Phone,
  map: Map,
  pin: MapPin,
  calendar: Calendar,
  money: DollarSign,
  shop: ShoppingBag,
  users: Users,
  star: Star,
  heart: Heart,
  tag: Tag,
  bookmark: Bookmark,
  activity: Activity,
  clipboard: Clipboard,
};

export const CUSTOM_ICON_IDS = Object.keys(CUSTOM_ICON_MAP);

export function CustomIcon({ name, className }: { name?: string; className?: string }) {
  const Comp = CUSTOM_ICON_MAP[name || 'box'] || Box;
  return <Comp className={className} />;
}

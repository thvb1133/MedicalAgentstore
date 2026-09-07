export interface Agent {
  id: string;
  name: string;
  vendor: string;
  category: string;
  summary: string;
  description: string;
  priceMonthly: number;
  rating: number;
  certifications: string[];
  tags: string[];
}

export interface OrderLine {
  agentId: string;
  name: string;
  quantity: number;
  priceMonthly: number;
}

export interface Order {
  id: string;
  createdAt: string;
  customer: string;
  organization: string;
  lines: OrderLine[];
  monthlyTotal: number;
}

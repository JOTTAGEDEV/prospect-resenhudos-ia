import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import type { Lead } from "@jotage/shared";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "./ui/badge";
import { CompanySymbol, NoData } from "./common";
export function LeadTable({ leads }: { leads: Lead[] }) {
  const columns = useMemo<ColumnDef<Lead>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Empresa",
        cell: ({ row }) => (
          <Link className="company-cell" to={`/leads/${row.original.id}`}>
            <CompanySymbol name={row.original.name} />
            <div>
              <strong>{row.original.name}</strong>
              <small>
                {row.original.city || "Localização não informada"}
                {row.original.state ? ` · ${row.original.state}` : ""}
              </small>
            </div>
          </Link>
        ),
      },
      { accessorKey: "category", header: "Segmento" },
      {
        accessorKey: "score",
        header: "Oportunidade",
        cell: ({ row }) => (
          <span
            className={`score ${row.original.score === null ? "unknown" : ""}`}
          >
            {row.original.score === null
              ? "Dados insuficientes"
              : `${row.original.score}/100`}
          </span>
        ),
      },
      {
        accessorKey: "stage",
        header: "Etapa",
        cell: ({ row }) => (
          <Badge variant="secondary">{row.original.stage}</Badge>
        ),
      },
      {
        id: "open",
        header: "",
        cell: ({ row }) => (
          <Link
            to={`/leads/${row.original.id}`}
            aria-label={`Abrir ${row.original.name}`}
          >
            <ArrowUpRight size={18} />
          </Link>
        ),
      },
    ],
    [],
  );
  const table = useReactTable({
    data: leads,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });
  if (!leads.length) return <NoData />;
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          {table.getHeaderGroups().map((g) => (
            <tr key={g.id}>
              {g.headers.map((h) => (
                <th key={h.id} scope="col">
                  {flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((c) => (
                <td key={c.id}>
                  {flexRender(c.column.columnDef.cell, c.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

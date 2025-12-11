import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { History, Search, User, Calendar, Package, Settings, Users, Edit, Trash2, Plus, Eye, RefreshCw, ChevronDown, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AuditLog {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  user_id: string | null;
  old_values: any;
  new_values: any;
  ip_address: string | null;
  device_info: string | null;
  created_at: string;
  user?: { full_name: string; email: string } | null;
}

const PAGE_SIZE = 50;

export default function AuditLogs() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async (pageNum: number, isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else if (pageNum === 0) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }
    setError(null);

    try {
      // First, get logs without the join to avoid FK issues
      const { data: logsData, error: logsError, count } = await supabase
        .from("audit_logs")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

      if (logsError) throw logsError;

      // Get unique user IDs from logs
      const userIds = [...new Set((logsData || []).map(log => log.user_id).filter(Boolean))];
      
      // Fetch user profiles separately if there are any user IDs
      let usersMap: Record<string, { full_name: string; email: string }> = {};
      if (userIds.length > 0) {
        const { data: usersData } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", userIds);
        
        if (usersData) {
          usersMap = usersData.reduce((acc, user) => {
            acc[user.id] = { full_name: user.full_name, email: user.email };
            return acc;
          }, {} as Record<string, { full_name: string; email: string }>);
        }
      }

      // Combine logs with user info
      const enrichedLogs: AuditLog[] = (logsData || []).map(log => ({
        ...log,
        user: log.user_id ? usersMap[log.user_id] || null : null
      }));

      if (pageNum === 0 || isRefresh) {
        setLogs(enrichedLogs);
      } else {
        setLogs(prev => [...prev, ...enrichedLogs]);
      }
      
      setTotalCount(count || 0);
      setHasMore((logsData?.length || 0) === PAGE_SIZE);
      setPage(pageNum);
    } catch (error: any) {
      console.error("Error fetching audit logs:", error);
      setError(error.message || "Failed to fetch audit logs");
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to fetch audit logs",
      });
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
      setIsRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchLogs(0);
  }, [fetchLogs]);

  const handleRefresh = () => {
    setPage(0);
    fetchLogs(0, true);
  };

  const handleLoadMore = () => {
    if (!isLoadingMore && hasMore) {
      fetchLogs(page + 1);
    }
  };

  const getActionIcon = (action: string) => {
    switch (action.toLowerCase()) {
      case "create":
      case "insert":
        return <Plus className="h-3.5 w-3.5 text-emerald-500" />;
      case "update":
      case "edit":
        return <Edit className="h-3.5 w-3.5 text-blue-500" />;
      case "delete":
        return <Trash2 className="h-3.5 w-3.5 text-red-500" />;
      case "view":
      case "read":
        return <Eye className="h-3.5 w-3.5 text-muted-foreground" />;
      default:
        return <Settings className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const getActionBadge = (action: string) => {
    switch (action.toLowerCase()) {
      case "create":
      case "insert":
        return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400">{action}</Badge>;
      case "update":
      case "edit":
        return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400">{action}</Badge>;
      case "delete":
        return <Badge className="bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400">{action}</Badge>;
      default:
        return <Badge variant="outline">{action}</Badge>;
    }
  };

  const getEntityIcon = (entityType: string) => {
    switch (entityType.toLowerCase()) {
      case "item":
      case "items":
        return <Package className="h-4 w-4 text-primary" />;
      case "user":
      case "users":
      case "profile":
        return <Users className="h-4 w-4 text-primary" />;
      default:
        return <Settings className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const filteredLogs = logs.filter((log) => {
    const matchesSearch = 
      log.user?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.entity_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.entity_id?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesAction = actionFilter === "all" || log.action.toLowerCase() === actionFilter.toLowerCase();
    return matchesSearch && matchesAction;
  });

  const uniqueActions = [...new Set(logs.map(l => l.action))];

  return (
    <DashboardLayout title="Audit Logs" subtitle="Track all system activity">
      <div className="space-y-6">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {uniqueActions.map((action) => (
                  <SelectItem key={action} value={action.toLowerCase()}>{action}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="shrink-0"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <Card className="border-red-500/20 bg-red-500/5">
            <CardContent className="flex items-center gap-3 py-4">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-600 dark:text-red-400">Error loading audit logs</p>
                <p className="text-xs text-red-500/80">{error}</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Logs Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              Activity Log
            </CardTitle>
            <CardDescription>
              Showing {filteredLogs.length} of {totalCount} entries
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-4 animate-pulse">
                    <Skeleton className="h-10 w-24" />
                    <Skeleton className="h-10 w-32" />
                    <Skeleton className="h-6 w-20" />
                    <Skeleton className="h-6 w-16" />
                    <Skeleton className="h-6 flex-1" />
                  </div>
                ))}
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="text-center py-12">
                <History className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground font-medium">No audit logs found</p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  {searchQuery || actionFilter !== "all" 
                    ? "Try adjusting your search or filter" 
                    : "Activity will appear here as users interact with the system"}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[140px]">Timestamp</TableHead>
                        <TableHead className="w-[180px]">User</TableHead>
                        <TableHead className="w-[100px]">Action</TableHead>
                        <TableHead className="w-[100px]">Entity</TableHead>
                        <TableHead>Description</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLogs.map((log) => (
                        <TableRow key={log.id} className="group hover:bg-muted/50 transition-colors">
                          <TableCell>
                            <div className="flex items-center gap-2 text-sm">
                              <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <div>
                                <p className="font-medium">{format(new Date(log.created_at), "MMM d, yyyy")}</p>
                                <p className="text-xs text-muted-foreground">
                                  {format(new Date(log.created_at), "HH:mm:ss")}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <User className="h-4 w-4 text-primary" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{log.user?.full_name || "System"}</p>
                                <p className="text-xs text-muted-foreground truncate">{log.user?.email || "Automated action"}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getActionIcon(log.action)}
                              {getActionBadge(log.action)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getEntityIcon(log.entity_type)}
                              <span className="text-sm capitalize">{log.entity_type}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <p className="text-sm text-muted-foreground max-w-[300px] truncate">
                              {log.entity_id ? `ID: ${log.entity_id.slice(0, 8)}...` : "—"}
                            </p>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Load More Button */}
                {hasMore && filteredLogs.length >= PAGE_SIZE && (
                  <div className="flex justify-center pt-4">
                    <Button
                      variant="outline"
                      onClick={handleLoadMore}
                      disabled={isLoadingMore}
                      className="gap-2"
                    >
                      {isLoadingMore ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-4 w-4" />
                          Load More
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}


import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link2 } from "lucide-react";
import { Link } from "react-router-dom";

export default function Settings() {
  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>

        <Card>
          <CardHeader>
            <CardTitle>Social Media Connections</CardTitle>
            <CardDescription>
              Manage your connected accounts on the dedicated Connections page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/connections">
              <Button variant="outline" className="gap-2">
                <Link2 className="h-4 w-4" />
                Go to Connections
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

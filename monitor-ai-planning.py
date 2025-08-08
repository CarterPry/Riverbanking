#!/usr/bin/env python3

"""
AI Planning Monitor - Captures and displays AI's thought process and planning
for security testing workflows.
"""

import json
import asyncio
import websockets
import aiohttp
import sys
import uuid
import argparse
from datetime import datetime
from typing import Dict, List, Any
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.layout import Layout
from rich.live import Live
from rich.text import Text
from rich.progress import Progress, SpinnerColumn, TextColumn
import time

console = Console()

class AITestMonitor:
    """Monitor and capture AI's planning and thought process"""
    
    def __init__(self, backend_url="http://localhost:8001", ws_url="ws://localhost:8001"):
        self.backend_url = backend_url
        self.ws_url = ws_url
        self.workflow_id = str(uuid.uuid4())
        self.ai_thoughts = []
        self.test_plan = None
        self.current_phase = "Initializing"
        self.findings = []
        self.start_time = None
        
    async def send_test_request(self, target: str, description: str, scope: str = "/*"):
        """Send the initial test request to the backend"""
        
        self.start_time = datetime.now()
        
        request_data = {
            "workflowId": self.workflow_id,
            "target": target,
            "scope": scope,
            "description": description,
            "testType": "comprehensive",
            "options": {
                "includeRecon": True,
                "includeSubdomains": True,
                "testAuthentication": True,
                "testAPIs": True,
                "verboseLogging": True,
                "captureAIReasoning": True,
                "showThoughtProcess": True,
                "maxInitialTests": 5
            }
        }
        
        console.print(Panel.fit(
            f"[bold cyan]Sending Test Request[/bold cyan]\n"
            f"Target: {target}\n"
            f"Scope: {scope}\n"
            f"Objective: {description[:100]}...",
            title="📤 Request"
        ))
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.backend_url}/api/workflows/run",
                json=request_data,
                headers={"X-Workflow-Id": self.workflow_id}
            ) as response:
                result = await response.json()
                return result
    
    async def monitor_websocket(self):
        """Connect to WebSocket and monitor AI communication"""
        
        try:
            async with websockets.connect(f"{self.ws_url}/ws") as websocket:
                # Subscribe to workflow
                await websocket.send(json.dumps({
                    "type": "subscribe",
                    "workflowId": self.workflow_id
                }))
                
                console.print("[green]✅ WebSocket connected[/green]")
                
                while True:
                    try:
                        message = await asyncio.wait_for(websocket.recv(), timeout=1.0)
                        await self.handle_message(json.loads(message))
                    except asyncio.TimeoutError:
                        continue
                    except websockets.ConnectionClosed:
                        break
                        
        except Exception as e:
            console.print(f"[red]WebSocket error: {e}[/red]")
    
    async def handle_message(self, msg: Dict[str, Any]):
        """Process incoming WebSocket messages"""
        
        msg_type = msg.get('type', 'unknown')
        
        if msg_type == 'ai:thinking':
            self.display_ai_thought(msg.get('phase', 'general'), msg.get('content', ''))
            
        elif msg_type == 'ai:strategy':
            self.display_strategy(msg)
            
        elif msg_type == 'ai:classification':
            self.display_classification(msg)
            
        elif msg_type == 'test:plan':
            self.test_plan = msg.get('plan', {})
            self.display_test_plan()
            
        elif msg_type == 'test:start':
            self.current_phase = f"Running: {msg.get('test', 'Unknown')}"
            console.print(f"[yellow]🚀 {self.current_phase}[/yellow]")
            
        elif msg_type == 'finding':
            self.findings.append(msg)
            self.display_finding(msg)
            
        elif msg_type == 'workflow:complete':
            self.display_summary()
            return False
    
    def display_ai_thought(self, phase: str, thought: str):
        """Display AI's thought process"""
        
        self.ai_thoughts.append({
            "timestamp": datetime.now().isoformat(),
            "phase": phase,
            "thought": thought
        })
        
        panel = Panel(
            Text(thought, style="cyan"),
            title=f"🤖 AI Thinking - {phase}",
            border_style="cyan"
        )
        console.print(panel)
    
    def display_strategy(self, msg: Dict):
        """Display AI's strategy"""
        
        strategy = msg.get('strategy', {})
        reasoning = msg.get('reasoning', 'No reasoning provided')
        
        table = Table(title="📋 AI Strategy", show_header=True, header_style="bold magenta")
        table.add_column("Phase", style="cyan", width=15)
        table.add_column("Action", style="white")
        table.add_column("Priority", style="yellow", width=10)
        
        if 'recommendations' in strategy:
            for rec in strategy['recommendations']:
                table.add_row(
                    strategy.get('phase', 'N/A'),
                    f"{rec.get('tool', 'Unknown')}: {rec.get('purpose', '')}",
                    rec.get('priority', 'medium')
                )
        
        console.print(table)
        console.print(Panel(reasoning, title="💭 Reasoning", border_style="blue"))
    
    def display_classification(self, msg: Dict):
        """Display intent classification"""
        
        intent = msg.get('intent', 'Unknown')
        confidence = msg.get('confidence', 0)
        
        console.print(Panel(
            f"Intent: [bold]{intent}[/bold]\n"
            f"Confidence: [yellow]{confidence:.2%}[/yellow]",
            title="🎯 Intent Classification",
            border_style="green"
        ))
    
    def display_test_plan(self):
        """Display the complete test plan"""
        
        if not self.test_plan:
            return
        
        table = Table(title="🗺️ Test Execution Plan", show_header=True)
        table.add_column("Step", style="cyan", width=5)
        table.add_column("Tool", style="yellow", width=20)
        table.add_column("Target", style="white", width=30)
        table.add_column("Purpose", style="green")
        
        steps = self.test_plan.get('steps', []) or self.test_plan.get('recommendations', [])
        
        for i, step in enumerate(steps, 1):
            table.add_row(
                str(i),
                step.get('tool', step.get('name', 'Unknown')),
                step.get('target', self.test_plan.get('target', 'N/A'))[:30],
                step.get('purpose', step.get('description', 'N/A'))
            )
        
        console.print(table)
        
        # Highlight first step
        if steps:
            first_step = steps[0]
            console.print(Panel(
                f"[bold]First Action:[/bold] {first_step.get('tool', 'Unknown')}\n"
                f"[bold]Purpose:[/bold] {first_step.get('purpose', 'N/A')}\n"
                f"[bold]Priority:[/bold] {first_step.get('priority', 'Not specified')}",
                title="🎯 Initial Step Details",
                border_style="yellow"
            ))
    
    def display_finding(self, finding: Dict):
        """Display a security finding"""
        
        severity = finding.get('severity', 'info')
        severity_colors = {
            'critical': 'red',
            'high': 'orange',
            'medium': 'yellow',
            'low': 'blue',
            'info': 'cyan'
        }
        
        console.print(Panel(
            f"[bold]Type:[/bold] {finding.get('type', 'Unknown')}\n"
            f"[bold]Description:[/bold] {finding.get('description', 'N/A')}\n"
            f"[bold]Impact:[/bold] {finding.get('impact', 'N/A')}",
            title=f"🔍 Finding - [{severity_colors.get(severity, 'white')}]{severity.upper()}[/{severity_colors.get(severity, 'white')}]",
            border_style=severity_colors.get(severity, 'white')
        ))
    
    def display_summary(self):
        """Display final summary"""
        
        duration = (datetime.now() - self.start_time).total_seconds() if self.start_time else 0
        
        summary = Panel(
            f"[bold]Workflow ID:[/bold] {self.workflow_id}\n"
            f"[bold]Duration:[/bold] {duration:.2f} seconds\n"
            f"[bold]AI Thoughts Captured:[/bold] {len(self.ai_thoughts)}\n"
            f"[bold]Findings:[/bold] {len(self.findings)}\n"
            f"[bold]Test Plan Generated:[/bold] {'Yes' if self.test_plan else 'No'}",
            title="📊 Summary",
            border_style="green"
        )
        
        console.print(summary)
        
        # Save results
        output_file = f"ai-analysis-{self.workflow_id}.json"
        with open(output_file, 'w') as f:
            json.dump({
                "workflowId": self.workflow_id,
                "duration": duration,
                "aiThoughts": self.ai_thoughts,
                "testPlan": self.test_plan,
                "findings": self.findings
            }, f, indent=2)
        
        console.print(f"[green]✅ Results saved to {output_file}[/green]")

async def main():
    """Main execution"""
    
    parser = argparse.ArgumentParser(description='Monitor AI Security Test Planning')
    parser.add_argument('--target', default='https://sweetspotgov.com',
                       help='Target URL to test')
    parser.add_argument('--description', 
                       default='I want you to test against all subdomains and dir\'s. Test all access, stuff like sql injection, sending JWT tokens, catching any leaky api\'s stuff like this.',
                       help='Test description/objectives')
    parser.add_argument('--scope', default='/*',
                       help='Scope of testing')
    parser.add_argument('--backend', default='http://localhost:8001',
                       help='Backend URL')
    parser.add_argument('--ws', default='ws://localhost:8001',
                       help='WebSocket URL')
    
    args = parser.parse_args()
    
    console.print(Panel.fit(
        "[bold cyan]AI Security Test Planning Monitor[/bold cyan]\n"
        "Captures AI's thought process and initial planning",
        title="🧪 Test Monitor"
    ))
    
    monitor = AITestMonitor(backend_url=args.backend, ws_url=args.ws)
    
    # Start monitoring tasks
    tasks = [
        monitor.send_test_request(args.target, args.description, args.scope),
        monitor.monitor_websocket()
    ]
    
    try:
        # Run monitoring
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Check for errors
        for result in results:
            if isinstance(result, Exception):
                console.print(f"[red]Error: {result}[/red]")
        
    except KeyboardInterrupt:
        console.print("\n[yellow]Monitoring stopped by user[/yellow]")
    except Exception as e:
        console.print(f"[red]Fatal error: {e}[/red]")
        sys.exit(1)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        console.print("\n[yellow]Exiting...[/yellow]")
        sys.exit(0)
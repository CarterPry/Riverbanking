#!/usr/bin/env python3

"""
Test User Input Runner - Python Version
This script demonstrates how to programmatically submit test cases to the security testing platform
"""

import json
import time
import argparse
import requests
from typing import Dict, List, Any
import os
from datetime import datetime

# Configuration
API_BASE_URL = os.getenv('API_URL', 'http://localhost:3000/api')
DELAY_BETWEEN_TESTS = 2  # seconds

class SecurityTestRunner:
    def __init__(self, api_url: str = API_BASE_URL):
        self.api_url = api_url
        self.session = requests.Session()
        self.results = {
            'successful': [],
            'failed': [],
            'total': 0,
            'start_time': datetime.now()
        }
    
    def create_workflow_payload(self, test_input: Dict[str, Any]) -> Dict[str, Any]:
        """Create the API payload from test input"""
        payload = {
            'target': test_input['target'],
            'scope': test_input['scope'],
            'description': test_input['description'],
            'template': f"security-{test_input['testType']}"
        }
        
        # Add authentication if provided
        if test_input.get('username') and test_input.get('password'):
            payload['auth'] = {
                'username': test_input['username'],
                'password': test_input['password']
            }
        
        return payload
    
    def run_test(self, scenario: Dict[str, Any]) -> Dict[str, Any]:
        """Run a single test scenario"""
        print(f"\n🔍 Running: {scenario['scenario']}")
        print(f"📝 Description: {scenario['description']}")
        
        try:
            payload = self.create_workflow_payload(scenario['input'])
            print(f"📤 Payload: {json.dumps(payload, indent=2)}")
            
            response = self.session.post(
                f"{self.api_url}/run-soc2-workflow",
                json=payload,
                timeout=30
            )
            response.raise_for_status()
            
            data = response.json()
            print(f"✅ Success! Workflow ID: {data.get('workflowId')}")
            print(f"📊 Status: {data.get('status')}")
            
            return {
                'success': True,
                'workflowId': data.get('workflowId'),
                'scenario': scenario['scenario'],
                'response': data
            }
        
        except requests.exceptions.RequestException as e:
            error_msg = str(e)
            if hasattr(e, 'response') and e.response is not None:
                try:
                    error_data = e.response.json()
                    error_msg = error_data.get('error', str(e))
                except:
                    error_msg = e.response.text or str(e)
            
            print(f"❌ Error: {error_msg}")
            
            return {
                'success': False,
                'error': error_msg,
                'scenario': scenario['scenario']
            }
    
    def check_workflow_status(self, workflow_id: str) -> Dict[str, Any]:
        """Check the status of a workflow"""
        try:
            response = self.session.get(
                f"{self.api_url}/workflows/{workflow_id}/status",
                timeout=10
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"Error checking status: {e}")
            return None
    
    def run_batch_tests(self, test_scenarios: List[Dict[str, Any]], 
                       test_name: str = "Test Scenarios") -> None:
        """Run a batch of test scenarios"""
        print(f"\n📋 Running {test_name}...")
        
        for scenario in test_scenarios:
            result = self.run_test(scenario)
            self.results['total'] += 1
            
            if result['success']:
                self.results['successful'].append(result)
            else:
                self.results['failed'].append(result)
            
            # Wait between tests
            time.sleep(DELAY_BETWEEN_TESTS)
    
    def generate_report(self) -> str:
        """Generate a detailed test report"""
        duration = datetime.now() - self.results['start_time']
        
        report = f"""
Security Testing Platform - Test Report
======================================
Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
Duration: {duration}

Summary
-------
Total Tests: {self.results['total']}
✅ Successful: {len(self.results['successful'])}
❌ Failed: {len(self.results['failed'])}
Success Rate: {(len(self.results['successful']) / self.results['total'] * 100):.1f}%
"""
        
        if self.results['failed']:
            report += "\n\nFailed Tests\n------------\n"
            for failure in self.results['failed']:
                report += f"- {failure['scenario']}\n"
                report += f"  Error: {failure['error']}\n\n"
        
        if self.results['successful']:
            report += "\n\nSuccessful Tests\n---------------\n"
            for success in self.results['successful']:
                report += f"- {success['scenario']}\n"
                report += f"  Workflow ID: {success['workflowId']}\n"
                
                # Check current status
                status = self.check_workflow_status(success['workflowId'])
                if status:
                    report += f"  Current Status: {status.get('status', 'Unknown')}\n"
                report += "\n"
        
        return report
    
    def save_results(self, filename: str = None) -> str:
        """Save test results to a file"""
        if filename is None:
            filename = f"test-results-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
        
        with open(filename, 'w') as f:
            json.dump({
                'timestamp': datetime.now().isoformat(),
                'api_url': self.api_url,
                'results': self.results,
                'summary': {
                    'total': self.results['total'],
                    'successful': len(self.results['successful']),
                    'failed': len(self.results['failed'])
                }
            }, f, indent=2, default=str)
        
        print(f"\n💾 Results saved to: {filename}")
        return filename


def load_test_inputs(filename: str = 'test-user-inputs.json') -> Dict[str, Any]:
    """Load test inputs from JSON file"""
    with open(filename, 'r') as f:
        return json.load(f)


def main():
    parser = argparse.ArgumentParser(
        description='Run security platform tests'
    )
    parser.add_argument(
        '--scenario', 
        help='Run a specific scenario by name'
    )
    parser.add_argument(
        '--list', 
        action='store_true',
        help='List all available scenarios'
    )
    parser.add_argument(
        '--api-url',
        default=API_BASE_URL,
        help='API base URL'
    )
    parser.add_argument(
        '--save-results',
        action='store_true',
        help='Save test results to file'
    )
    parser.add_argument(
        '--report',
        action='store_true',
        help='Generate detailed report'
    )
    parser.add_argument(
        '--quick',
        action='store_true',
        help='Run only quick scan tests'
    )
    parser.add_argument(
        '--edge-cases-only',
        action='store_true',
        help='Run only edge case tests'
    )
    
    args = parser.parse_args()
    
    # Load test inputs
    test_inputs = load_test_inputs()
    
    if args.list:
        print("Available test scenarios:\n")
        print("Regular Scenarios:")
        for scenario in test_inputs['test_scenarios']:
            print(f"  - {scenario['scenario']}: {scenario['description']}")
        print("\nEdge Cases:")
        for scenario in test_inputs['edge_cases']:
            print(f"  - {scenario['scenario']}: {scenario['description']}")
        return
    
    # Initialize test runner
    runner = SecurityTestRunner(args.api_url)
    
    if args.scenario:
        # Run specific scenario
        all_scenarios = test_inputs['test_scenarios'] + test_inputs['edge_cases']
        scenario = next((s for s in all_scenarios if s['scenario'] == args.scenario), None)
        
        if not scenario:
            print(f"❌ Scenario '{args.scenario}' not found")
            print("\nUse --list to see available scenarios")
            return
        
        runner.run_test(scenario)
    
    else:
        # Run batch tests
        if args.edge_cases_only:
            runner.run_batch_tests(test_inputs['edge_cases'], "Edge Cases")
        elif args.quick:
            quick_tests = [s for s in test_inputs['test_scenarios'] 
                          if s['input']['testType'] == 'quick']
            runner.run_batch_tests(quick_tests, "Quick Scan Tests")
        else:
            runner.run_batch_tests(test_inputs['test_scenarios'], "Test Scenarios")
            runner.run_batch_tests(test_inputs['edge_cases'], "Edge Cases")
    
    # Generate report if requested
    if args.report:
        report = runner.generate_report()
        print(report)
        
        # Save report to file
        report_file = f"test-report-{datetime.now().strftime('%Y%m%d-%H%M%S')}.txt"
        with open(report_file, 'w') as f:
            f.write(report)
        print(f"\n📄 Report saved to: {report_file}")
    
    # Save results if requested
    if args.save_results:
        runner.save_results()
    
    # Print summary
    print(f"\n\n📊 Test Summary")
    print("===============")
    print(f"Total Tests: {runner.results['total']}")
    print(f"✅ Successful: {len(runner.results['successful'])}")
    print(f"❌ Failed: {len(runner.results['failed'])}")


if __name__ == '__main__':
    main()
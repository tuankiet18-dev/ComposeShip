import os
import sys
import subprocess
import shutil

# Add the worker directory to sys.path so we can import the modules
worker_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, worker_dir)

from modules import stack_detector
from modules import dockerfile_generator

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")
DOCS_DIR = os.path.abspath(os.path.join(worker_dir, "..", "docs", "testing"))

def run_tests_and_generate_report():
    os.makedirs(DOCS_DIR, exist_ok=True)
    report_path = os.path.join(DOCS_DIR, "stack_and_dockerfile_validation_report.md")
    
    fixtures = [
        {"name": "aspnet", "expected_stack": "aspnet"},
        {"name": "springboot-maven", "expected_stack": "springboot-maven"},
        {"name": "springboot-gradle", "expected_stack": "springboot-gradle"},
        {"name": "nextjs", "expected_stack": "nextjs"},
        {"name": "angular", "expected_stack": "angular"},
        {"name": "react", "expected_stack": "react"},
        {"name": "unsupported", "expected_stack": "unsupported"},
    ]
    
    results = []
    
    for fixture in fixtures:
        name = fixture["name"]
        expected = fixture["expected_stack"]
        source_path = os.path.join(FIXTURES_DIR, name)
        
        detected = "N/A"
        detection_result = "Fail"
        dockerfile_generated = "No"
        docker_build_result = "N/A"
        notes = ""
        
        # 1. Test Stack Detection
        try:
            detected = stack_detector.detect_stack(source_path)
            if detected == expected:
                detection_result = "Pass"
            else:
                notes += f"Expected '{expected}', got '{detected}'. "
        except ValueError as e:
            if expected == "unsupported":
                detected = "Unsupported"
                detection_result = "Pass"
            else:
                detected = "Error"
                notes += f"Detection failed: {str(e)}. "
                
        # 2. Test Dockerfile Generation
        if detection_result == "Pass" and expected != "unsupported":
            try:
                dockerfile_path = dockerfile_generator.generate_dockerfile(source_path, detected)
                if os.path.exists(dockerfile_path):
                    dockerfile_generated = "Yes"
                else:
                    notes += "Dockerfile path returned but file not found. "
            except Exception as e:
                notes += f"Generation failed: {str(e)}. "
                
        # 3. Test Docker Build
        if dockerfile_generated == "Yes":
            # Some templates need placeholder files to build successfully.
            # Next.js needs pages/index.js or app/page.js
            if expected == "nextjs":
                os.makedirs(os.path.join(source_path, "pages"), exist_ok=True)
                with open(os.path.join(source_path, "pages", "index.js"), "w") as f:
                    f.write("export default function Home() { return <div>Home</div> }")
            # React needs src/index.js
            elif expected == "react":
                os.makedirs(os.path.join(source_path, "src"), exist_ok=True)
                with open(os.path.join(source_path, "src", "index.js"), "w") as f:
                    f.write("console.log('React app');")
            elif expected == "angular":
                os.makedirs(os.path.join(source_path, "src"), exist_ok=True)
                with open(os.path.join(source_path, "src", "main.ts"), "w") as f:
                    f.write("console.log('Angular app');")
            # Spring boot needs src/main/java
            elif expected in ["springboot-maven", "springboot-gradle"]:
                os.makedirs(os.path.join(source_path, "src", "main", "java"), exist_ok=True)
                
            try:
                build_cmd = ["docker", "build", "-t", f"test-{name}", "."]
                result = subprocess.run(
                    build_cmd, 
                    cwd=source_path, 
                    stdout=subprocess.PIPE, 
                    stderr=subprocess.PIPE,
                    text=True
                )
                if result.returncode == 0:
                    docker_build_result = "Pass"
                else:
                    docker_build_result = "Fail"
                    notes += f"Docker build failed. "
                    # Log to a file instead of putting in markdown table
                    with open(os.path.join(source_path, "build_error.log"), "w") as f:
                        f.write(result.stdout)
                        f.write(result.stderr)
            except FileNotFoundError:
                docker_build_result = "Skipped (Docker not found)"
                
        results.append({
            "fixture": name,
            "expected": expected,
            "detected": detected,
            "detection_result": detection_result,
            "dockerfile_generated": dockerfile_generated,
            "docker_build_result": docker_build_result,
            "notes": notes.strip()
        })
        
    # Write report
    with open(report_path, "w") as f:
        f.write("# Stack and Dockerfile Validation Report\n\n")
        f.write("| Test Repo / Fixture | Expected Stack | Detected Stack | Detection Result | Dockerfile Generated | Docker Build Result | Notes |\n")
        f.write("|---|---|---|---|---|---|---|\n")
        
        for r in results:
            f.write(f"| {r['fixture']} | {r['expected']} | {r['detected']} | {r['detection_result']} | {r['dockerfile_generated']} | {r['docker_build_result']} | {r['notes']} |\n")
            
        f.write("\n## Summary\n\n")
        
        correct = [r['fixture'] for r in results if r['detection_result'] == "Pass"]
        incorrect = [r['fixture'] for r in results if r['detection_result'] != "Pass"]
        built = [r['fixture'] for r in results if r['docker_build_result'] == "Pass"]
        failed_build = [r['fixture'] for r in results if r['docker_build_result'] == "Fail"]
        
        f.write(f"**Repos/fixtures detected correctly:** {', '.join(correct) if correct else 'None'}\n")
        f.write(f"**Repos/fixtures detected incorrectly:** {', '.join(incorrect) if incorrect else 'None'}\n")
        f.write(f"**Dockerfiles built successfully:** {', '.join(built) if built else 'None'}\n")
        f.write(f"**Dockerfiles failed to build:** {', '.join(failed_build) if failed_build else 'None'}\n")
        
        f.write("\n## Recommended Changes\n")
        f.write("Based on the results, any necessary code changes will be listed here.\n")

    print(f"Report generated at {report_path}")

if __name__ == "__main__":
    run_tests_and_generate_report()

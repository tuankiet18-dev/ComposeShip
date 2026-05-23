from pathlib import Path
from urllib.parse import urlparse
import os
import re
from playwright.sync_api import sync_playwright, expect

BASE = os.environ['BASE_URL']
ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'scripts' / 'artifacts' / 'uiux'
ART.mkdir(parents=True, exist_ok=True)
issues = []

projects = [
    {'id':'project-1','name':'Demo Project','description':'Smoke-test project','status':'live','deploymentMode':'SingleService','serviceCount':1,'createdAt':'2026-05-23T00:00:00Z','updatedAt':'2026-05-23T00:00:00Z'},
    {'id':'project-2','name':'Failed API','description':'API deployment failure','status':'failed','deploymentMode':'compose','serviceCount':2,'createdAt':'2026-05-22T00:00:00Z','updatedAt':'2026-05-23T00:00:00Z'},
]

def project_detail(project_id):
    if project_id == 'project-3':
        return {'id':'project-3','name':'Created Project','description':'Created from UI test','status':'created','deploymentMode':'SingleService','serviceCount':0,'composeConfig':None,'recentProjectDeployments':[],'services':[],'createdAt':'2026-05-23T00:00:00Z','updatedAt':'2026-05-23T00:00:00Z'}
    if project_id == 'project-2':
        return {'id':'project-2','name':'Failed API','description':'API deployment failure','status':'failed','deploymentMode':'compose','serviceCount':2,'composeConfig':None,'recentProjectDeployments':[{'id':'project-deployment-1','projectId':'project-2','status':'failed','composeProjectName':'failed-api','publicUrls':[],'errorMessage':'Compose stack failed during health check','version':2,'startedAt':'2026-05-23T00:00:00Z','completedAt':'2026-05-23T00:00:38Z','createdAt':'2026-05-23T00:00:00Z'}],'services':[{'id':'service-2','name':'api','serviceType':'backend','detectedStack':'ASP.NET','status':'failed','liveUrl':None}],'createdAt':'2026-05-22T00:00:00Z','updatedAt':'2026-05-23T00:00:00Z'}
    return {'id':'project-1','name':'Demo Project','description':'Smoke-test project','status':'live','deploymentMode':'SingleService','serviceCount':1,'composeConfig':None,'recentProjectDeployments':[],'services':[{'id':'service-1','name':'web','serviceType':'frontend','detectedStack':'React','status':'live','liveUrl':'https://example.test'}],'createdAt':'2026-05-23T00:00:00Z','updatedAt':'2026-05-23T00:00:00Z'}

def service_detail(service_id):
    if service_id == 'service-2':
        return {'id':'service-2','projectId':'project-2','name':'api','repoUrl':'https://github.com/example/api','branch':'main','subfolder':None,'serviceType':'backend','detectedStack':'ASP.NET','networkAliases':'api','containerId':'container-2','status':'failed','liveUrl':None,'environmentVariables':[{'id':'env-1','key':'DATABASE_URL','value':'postgres://hidden','isSecret':True}],'recentDeployments':[{'id':'deployment-2','status':'failed','version':5,'startedAt':'2026-05-23T00:00:00Z','completedAt':'2026-05-23T00:00:38Z','createdAt':'2026-05-23T00:00:00Z','hasDiagnosticSnapshot':False,'hasAiDiagnosis':False}],'createdAt':'2026-05-22T00:00:00Z','updatedAt':'2026-05-23T00:00:00Z'}
    return {'id':'service-1','projectId':'project-1','name':'web','repoUrl':'https://github.com/example/web','branch':'main','subfolder':None,'serviceType':'frontend','detectedStack':'React','networkAliases':None,'containerId':'container-1','status':'live','liveUrl':'https://example.test','environmentVariables':[],'recentDeployments':[{'id':'deployment-1','status':'live','version':3,'startedAt':'2026-05-23T00:00:00Z','completedAt':'2026-05-23T00:01:12Z','createdAt':'2026-05-23T00:00:00Z','hasDiagnosticSnapshot':False,'hasAiDiagnosis':False}],'createdAt':'2026-05-23T00:00:00Z','updatedAt':'2026-05-23T00:00:00Z'}

def mock(route, request):
    path = urlparse(request.url).path
    if path == '/api/auth/me':
        route.fulfill(status=200, json={'id':'user-1','email':'tester@example.com','fullName':'Test User','createdAt':'2026-05-23T00:00:00Z'})
    elif path == '/api/projects':
        if request.method == 'GET': route.fulfill(status=200, json=projects)
        elif request.method == 'POST': route.fulfill(status=201, json={'id':'project-3','name':'Created Project'})
        else: route.fulfill(status=204, body='')
    elif path.startswith('/api/projects/') and path.count('/') == 3:
        if request.method == 'DELETE':
            route.fulfill(status=204, body='')
        else:
            route.fulfill(status=200, json=project_detail(path.split('/')[-1]))
    elif path.startswith('/api/projects/') and path.endswith('/services'):
        route.fulfill(status=201, json={'id':'service-3','name':'worker'})
    elif path.startswith('/api/projects/') and path.endswith('/deploy'):
        route.fulfill(status=202, json={'id':'project-deployment-2','status':'queued'})
    elif path.startswith('/api/projects/') and path.endswith('/stop'):
        route.fulfill(status=204, body='')
    elif path.startswith('/api/services/') and path.count('/') == 3:
        if request.method == 'PUT':
            route.fulfill(status=200, json=service_detail(path.split('/')[-1]))
        elif request.method == 'DELETE':
            route.fulfill(status=204, body='')
        else:
            route.fulfill(status=200, json=service_detail(path.split('/')[-1]))
    elif path.startswith('/api/services/') and path.endswith('/deploy'):
        route.fulfill(status=202, json={'id':'deployment-new','status':'queued'})
    elif path.startswith('/api/services/') and path.endswith('/stop'):
        route.fulfill(status=204, body='')
    elif path.endswith('/ai-diagnosis'):
        route.fulfill(status=200, json={
            'id':'diagnosis-1',
            'deploymentId':path.split('/')[-2],
            'diagnosis':{
                'diagnosis':'The service failed during health checks after the container started.',
                'rootCauseCategory':'health-check',
                'confidence':'high',
                'evidence':['Health check returned 502 before timeout','Application log shows missing DATABASE_URL'],
                'filesToInspect':[{'path':'appsettings.json','reason':'Verify required connection strings'}],
                'suggestedFixes':['Add DATABASE_URL to environment variables','Confirm the app binds to the configured port'],
                'isLikelyPlatformIssue':False,
                'platformIssueReason':None,
                'missingInformation':[]
            },
            'modelName':'test-model',
            'promptVersion':'deployment_diagnosis_v1',
            'createdAt':'2026-05-23T00:00:00Z',
            'updatedAt':'2026-05-23T00:00:00Z'
        })
    elif path.endswith('/logs'):
        route.fulfill(status=200, json={'deploymentId':path.split('/')[-2],'status':'live','buildLogs':'INFO Build completed\nINFO Service is live\nWARN Example warning\nERROR this-is-a-very-long-log-token-that-used-to-force-horizontal-overflow-because-it-had-no-natural-breakpoints-0123456789abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz'})
    elif path.endswith('/env'):
        route.fulfill(status=204, body='')
    else:
        route.fulfill(status=404, json={'message':f'unhandled {path}'})

def attach(page):
    page.on('pageerror', lambda exc: issues.append(f'pageerror: {exc}'))
    page.on('console', lambda msg: issues.append(f'console {msg.type}: {msg.text}') if msg.type in ['error'] else None)
    page.route('**/api/**', mock)

def assert_no_horizontal_overflow(page, label):
    overflowing = page.evaluate("""() => {
        const root = document.documentElement;
        const body = document.body;
        return Math.max(root.scrollWidth, body.scrollWidth) > root.clientWidth + 1;
    }""")
    if overflowing:
        issues.append(f'horizontal overflow: {label}')

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    desktop = browser.new_page(viewport={'width':1440,'height':1000})
    attach(desktop)
    for path, text in [('/', 'Deploy from GitHub'),('/login','Welcome back'),('/register','Create your account'),('/dashboard','Recent deployments'),('/projects','Demo Project'),('/deployments','Deployment logs'),('/settings','Preferences')]:
        desktop.goto(BASE + path, wait_until='networkidle')
        expect(desktop.get_by_text(text).first).to_be_visible(timeout=10000)
        assert_no_horizontal_overflow(desktop, f'desktop {path}')
        desktop.screenshot(path=str(ART / f"desktop_{path.strip('/').replace('/', '_') or 'home'}.png"), full_page=True)

    desktop.goto(BASE + '/projects/new', wait_until='networkidle')
    expect(desktop.get_by_text('Project details')).to_be_visible(timeout=10000)
    desktop.get_by_label('Project name').fill('Created Project')
    desktop.get_by_role('button', name='Create project').click()
    expect(desktop.get_by_text('Created Project')).to_be_visible(timeout=10000)
    assert_no_horizontal_overflow(desktop, 'desktop projects new')

    desktop.goto(BASE + '/projects/project-1', wait_until='networkidle')
    expect(desktop.get_by_text('Demo Project')).to_be_visible(timeout=10000)
    expect(desktop.get_by_text('Live').first).to_be_visible(timeout=10000)
    desktop.get_by_role('button', name='Add service').click()
    desktop.get_by_label('Service name').fill('worker')
    desktop.get_by_label('Repository URL').fill('https://github.com/example/worker')
    desktop.get_by_role('button', name='Add service').click()
    expect(desktop.get_by_text('Service added')).to_be_visible(timeout=10000)
    desktop.get_by_role('button', name='Deploy').first.click()
    expect(desktop.get_by_text('Deployment queued')).to_be_visible(timeout=10000)
    assert_no_horizontal_overflow(desktop, 'desktop project detail actions')

    desktop.goto(BASE + '/projects/project-1/services/service-1', wait_until='networkidle')
    expect(desktop.get_by_text('Environment variables')).to_be_visible(timeout=10000)
    desktop.get_by_role('button', name='Deploy').click()
    expect(desktop.get_by_text('Deployment queued')).to_be_visible(timeout=10000)
    desktop.get_by_role('button', name='Stop').click()
    expect(desktop.get_by_text('Stop queued')).to_be_visible(timeout=10000)
    desktop.get_by_role('button', name='Add variable').click()
    desktop.get_by_placeholder('KEY').fill('API_URL')
    desktop.get_by_placeholder('value').fill('https://api.example.test')
    desktop.get_by_role('button', name='Save variables').click()
    expect(desktop.get_by_text('Environment variables saved')).to_be_visible(timeout=10000)
    desktop.get_by_role('tab', name='Details').click()
    desktop.get_by_role('button', name='Save service').click()
    expect(desktop.get_by_text('Service details saved')).to_be_visible(timeout=10000)
    desktop.get_by_role('tab', name='Deployments').click()
    desktop.get_by_role('button', name='Logs').first.click()
    expect(desktop.get_by_text('INFO Build completed')).to_be_visible(timeout=10000)
    assert_no_horizontal_overflow(desktop, 'desktop service detail actions')

    desktop.goto(BASE + '/projects', wait_until='networkidle')
    desktop.get_by_role('textbox', name='Search projects', exact=True).fill('Failed')
    expect(desktop.get_by_text('Failed API')).to_be_visible(timeout=10000)
    expect(desktop.get_by_text('Demo Project')).not_to_be_visible(timeout=10000)

    desktop.goto(BASE + '/deployments', wait_until='networkidle')
    expect(desktop.get_by_text('INFO Build completed')).to_be_visible(timeout=10000)
    assert_no_horizontal_overflow(desktop, 'desktop deployments long logs')
    desktop.get_by_role('button', name='Failed only').click()
    expect(desktop.get_by_text('Compose stack failed during health check').first).to_be_visible(timeout=10000)
    desktop.get_by_role('button', name=re.compile('Failed API api deployment failed')).click()
    desktop.get_by_role('button', name='Diagnose', exact=True).click()
    expect(desktop.get_by_text('health-check')).to_be_visible(timeout=10000)
    expect(desktop.get_by_text('The service failed during health checks after the container started.')).to_be_visible(timeout=10000)
    assert_no_horizontal_overflow(desktop, 'desktop deployments diagnosis')
    desktop.screenshot(path=str(ART / 'desktop_deployments_diagnosis.png'), full_page=True)
    desktop.get_by_role('button', name='Copy').click()

    desktop.goto(BASE + '/settings', wait_until='networkidle')
    desktop.get_by_role('button', name='Dark mode').click()
    expect(desktop.locator('html.dark')).to_have_count(1)
    desktop.screenshot(path=str(ART / 'desktop_settings_dark.png'), full_page=True)

    mobile = browser.new_page(viewport={'width':390,'height':844}, is_mobile=True)
    attach(mobile)
    for path, text in [('/dashboard','Recent deployments'),('/projects','Projects'),('/deployments','Deployment logs'),('/settings','Preferences')]:
        mobile.goto(BASE + path, wait_until='networkidle')
        expect(mobile.get_by_text(text).first).to_be_visible(timeout=10000)
        assert_no_horizontal_overflow(mobile, f'mobile {path}')
        mobile.screenshot(path=str(ART / f"mobile_{path.strip('/').replace('/', '_')}.png"), full_page=True)

    for width, height in [(375, 812), (768, 900), (1024, 900), (1440, 1000)]:
        page = browser.new_page(viewport={'width': width, 'height': height}, is_mobile=width < 768)
        attach(page)
        for path in ['/dashboard', '/projects', '/deployments', '/settings']:
            page.goto(BASE + path, wait_until='networkidle')
            assert_no_horizontal_overflow(page, f'{width}px {path}')
        page.close()

    browser.close()

if issues:
    print('ISSUES')
    for issue in issues:
        print('-', issue)
    raise SystemExit(1)
print('UIUX_CHECK=pass')
print('ARTIFACTS=' + str(ART))

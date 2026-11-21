"""Exercise shipped label transactions, including partial setter failure."""
import ast
import json
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace as NS

source = Path('src/features/rhino/modeling/gh2_labels.py').read_text(encoding='utf-8')
scope = {'_g2l_system': NS(Guid=lambda value:uuid.UUID(value), Object=NS(ReferenceEquals=lambda a,b:a is b))}
exec(compile(ast.Module(body=[node for node in ast.parse(source).body if isinstance(node, ast.FunctionDef)], type_ignores=[]), '<shipped-label-helper>', 'exec'), scope)
execute = scope['_g2l_execute']

class Target:
    def __init__(self, name=None, writable=True):
        self.InstanceId = uuid.uuid4()
        self.Nomen = NS(Name='Original SDK Name')
        self._name = name
        self.writable = writable
        self.Inputs = NS(Forwards=[])
        self.PersistentData = object()
        self.Code = 'preserved code'
        self.fail_on = None
        self.fail_rollback = False
    @property
    def UserName(self): return self._name
    @UserName.setter
    def UserName(self, value):
        if value == self.fail_on and value is not None:
            self._name = value  # A setter can mutate before throwing.
            raise RuntimeError('setter rejected')
        if self.fail_rollback and value == 'original': raise RuntimeError('rollback rejected')
        self._name = value
    @property
    def DisplayName(self): return self._name
    def GetType(self):
        return NS(FullName='GH2.Component', GetProperty=lambda _: NS(CanWrite=self.writable, PropertyType=NS(FullName='System.String')))

class ObjectList:
    def __init__(self, objects): self.Forwards = objects
    def __iter__(self): raise TypeError('ObjectList is not iterable; use Forwards')

class Tests(unittest.TestCase):
    def setUp(self):
        self.a, self.b, self.port = Target(None), Target('original'), Target('x')
        self.a.Pins = None
        self.b.Parameters = NS(Inputs=[self.port],Outputs=[])
        self.port.Inputs.Forwards = [self.a.InstanceId]
        self.doc = NS(Identity=uuid.uuid4(),Objects=ObjectList([self.a,self.b]))
        self.plan = {'mode':'commit','expectedDocumentId':str(self.doc.Identity),'changes':[
            {'id':str(self.a.InstanceId),'expectedLabel':'','label':'数量'},
            {'id':str(self.b.InstanceId),'expectedLabel':'original','label':'组件'},
            {'id':str(self.port.InstanceId),'expectedLabel':'x','label':'横向坐标'}]}
    def run_plan(self, check=lambda:None): return execute(self.doc,self.plan,check)
    def test_inspect_optional_properties_and_null_names(self):
        self.plan = {'mode':'inspect'}
        result = self.run_plan()
        self.assertEqual(result['status'],'inspected')
        self.assertEqual(len(result['targets']),3)
        self.assertEqual(result['targets'][0]['label'],'')
        self.assertTrue(result['targets'][0]['writable'])
        self.assertFalse(hasattr(self.b,'Pins'))
    def test_validate_and_unicode_commit_preserve_structure_data_code(self):
        data = self.a.PersistentData
        self.plan['mode']='validate'
        self.assertEqual(self.run_plan()['status'],'validated')
        self.assertIsNone(self.a.UserName)
        self.plan['mode']='commit'
        result = self.run_plan()
        self.assertEqual(result['status'],'applied')
        self.assertEqual([self.a.UserName,self.b.UserName,self.port.UserName],['数量','组件','横向坐标'])
        self.assertIs(self.a.PersistentData,data)
        self.assertEqual(self.a.Code,'preserved code')
        self.assertEqual(self.port.Inputs.Forwards,[self.a.InstanceId])
        self.assertFalse(result['graphChanged'])
    def test_late_missing_target_prevents_all_writes(self):
        self.plan['changes'][-1]['id']=str(uuid.uuid4())
        self.assertEqual(self.run_plan()['status'],'rejected')
        self.assertIsNone(self.a.UserName)
    def test_stale_document_and_label_prevent_all_writes(self):
        self.plan['expectedDocumentId']=str(uuid.uuid4())
        self.assertEqual(self.run_plan()['status'],'rejected')
        self.plan['expectedDocumentId']=str(self.doc.Identity)
        self.plan['changes'][-1]['expectedLabel']='stale'
        self.assertEqual(self.run_plan()['status'],'rejected')
        self.assertIsNone(self.a.UserName)
    def test_setter_failure_rolls_back_even_the_throwing_target(self):
        self.b.fail_on='组件'
        result=self.run_plan()
        self.assertEqual(result['status'],'rejected')
        self.assertIsNone(self.a.UserName)
        self.assertEqual(self.b.UserName,'original')
        self.assertFalse(result['labelsChanged'])
    def test_rollback_failure_reported_honestly(self):
        self.b.fail_on='组件'
        self.b.fail_rollback=True
        result=self.run_plan()
        self.assertEqual(result['status'],'partial_failure')
        self.assertTrue(result['labelsChanged'])
        self.assertEqual(len(result['rollbackErrors']),1)
    def test_noop(self):
        for change in self.plan['changes']: change['label']=change['expectedLabel']
        self.assertEqual(self.run_plan()['status'],'unchanged')
        self.assertIsNone(self.a.UserName)
    def test_duplicate_readonly_and_invalid_label_prevent_writes(self):
        for invalid in ['bad\nlabel',42,'x'*257]:
            self.plan['changes'][-1]['label']=invalid
            self.assertEqual(self.run_plan()['status'],'rejected')
            self.assertIsNone(self.a.UserName)
        self.plan['changes'][-1]['label']='输入'
        self.port.writable=False
        self.assertEqual(self.run_plan()['status'],'rejected')
        self.port.writable=True
        self.plan['changes'].append(self.plan['changes'][0])
        self.assertEqual(self.run_plan()['status'],'rejected')
    def test_document_switch_before_write(self):
        calls=[]
        def check():
            calls.append(1)
            if len(calls)==2: raise ValueError('canvas changed')
        self.assertEqual(self.run_plan(check)['status'],'rejected')
        self.assertIsNone(self.a.UserName)
    def test_unexpected_wire_change_is_not_reported_as_success(self):
        calls=[]
        def check():
            calls.append(1)
            if len(calls)==3: self.port.Inputs.Forwards=[]
        result=self.run_plan(check)
        self.assertEqual(result['status'],'partial_failure')
        self.assertTrue(result['graphChanged'])
        self.assertIsNone(self.a.UserName)

if __name__ == '__main__':
    suite=unittest.defaultTestLoader.loadTestsFromTestCase(Tests)
    result=unittest.TextTestRunner().run(suite)
    print(json.dumps({'passed':result.testsRun-len(result.failures)-len(result.errors),'failures':len(result.failures),'errors':len(result.errors)}))
    raise SystemExit(0 if result.wasSuccessful() else 1)

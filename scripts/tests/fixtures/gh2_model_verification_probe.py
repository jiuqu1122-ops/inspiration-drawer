"""Execute the shipped fixed audit against SDK-shaped fixtures; no Rhino session writes."""
import ast
import json
import unittest
from pathlib import Path
from types import SimpleNamespace as NS

source = Path('src/features/rhino/modeling/gh2_model_verification.py').read_text(encoding='utf-8')
functions = [node for node in ast.parse(source).body if isinstance(node, ast.FunctionDef)]

class Select:
    def __getitem__(self, _): return lambda values, selector: map(selector, values)

class Property:
    PropertyType = bool
    CanWrite = True
    def __init__(self, name): self.Name = name
    def GetValue(self, obj): return obj.settings[self.Name]
    def SetValue(self, obj, value):
        if getattr(obj, 'fail_setting', False) and value: raise RuntimeError('setting rejected')
        obj.settings[self.Name] = value

class NativeType:
    FullName = 'ScriptComponents.Components.Python3Component'
    def GetProperty(self, name): return Property(name) if name in ['MarshalOutputs', 'MarshalInputs', 'MarshalGuids'] else None

def cache(valid=True): return NS(Clipping=NS(IsValid=valid), HasFaces=valid, HasWires=False, GetType=lambda:NS(FullName='NativeDisplayCache'))
def parameter(identity, values, visible=True, preview=True):
    tree = NS(ItemCount=len(values), NonNullItems=values)
    return NS(InstanceId=identity, Nomen=NS(Name=identity), State=NS(Data=NS(Tree=lambda:tree)), Inputs=NS(Forwards=[]), Display='Visible' if visible else 'Hidden', DisplayCache=cache(preview))
def geometry(kind='Rhino.Geometry.Brep', valid=True): return NS(raw_type=kind, IsValid=valid)
def component(identity, outputs, conversion=False):
    return NS(InstanceId=identity, Nomen=NS(Name=identity), Phase='Completed', State=NS(FaultException=None), Parameters=NS(Inputs=[], Outputs=outputs), GetType=lambda:NativeType(), Display='Visible', DisplayCache=cache(), Selected=True, settings={'MarshalOutputs':conversion,'MarshalInputs':False,'MarshalGuids':False})
def document(objects):
    lookup={str(obj.InstanceId):obj for obj in objects}
    params={str(p.InstanceId):p for obj in objects for p in list(obj.Parameters.Inputs)+list(obj.Parameters.Outputs)}
    return NS(Identity='document-1', Objects=NS(Find=lambda key:lookup.get(str(key)), FindParameter=lambda key:params.get(str(key))), Display=NS(Enabled=True,DrawWires=True,DrawMeshes=True,OnlySelected=False))

namespace={'_g2v_system':NS(Guid=lambda value:value,Boolean=bool,Object=object,String=str), '_g2v_clr':NS(GetClrType=lambda value:value), '_g2v_enumerable':NS(Select=Select())}
exec(compile(ast.Module(body=functions,type_ignores=[]),'shipped_gh2_audit','exec'),namespace)
namespace['_g2v_raw_type_selector']=lambda:lambda value:value.raw_type
audit=namespace['_g2v_audit']
repair=namespace['_g2v_repair_outputs']
plan={'componentIds':['final'],'geometryOutputIds':['geometry'],'expectedDocumentId':'document-1'}

class AuditTests(unittest.TestCase):
    def setup_model(self, value=None, conversion=False, preview=True):
        output=parameter('geometry',[value if value is not None else geometry()],preview=preview)
        final=component('final',[output],conversion)
        return final,output,document([final])
    def test_native_geometry_for_different_shape_types(self):
        for kind in ['Rhino.Geometry.Brep','Rhino.Geometry.Curve','Rhino.Geometry.Point3d','Rhino.Geometry.Mesh']:
            _,_,doc=self.setup_model(geometry(kind))
            self.assertEqual(audit(plan,doc)['status'],'passed')
    def test_opaque_python_object_cannot_pass_even_if_python_sees_valid_geometry(self):
        _,_,doc=self.setup_model(geometry('Python.Runtime.PyObject'))
        report=audit(plan,doc)
        self.assertEqual(report['status'],'needs_attention')
        self.assertIn('python_output_not_marshaled',[i['code'] for i in report['issues']])
        self.assertEqual(report['outputs'][0]['validGeometryItems'],0)
    def test_targeted_repair_is_never_a_completed_model(self):
        final,_,doc=self.setup_model(geometry('Python.Runtime.PyObject'))
        report=repair(plan,doc)
        self.assertEqual(report['changedComponentIds'],['final'])
        self.assertFalse(report['modelVerified'])
        self.assertEqual(final.settings,{'MarshalOutputs':True,'MarshalInputs':False,'MarshalGuids':False})
        self.assertEqual(audit(plan,doc)['status'],'needs_attention')
    def test_no_replay_when_conversion_already_enabled(self):
        final,_,doc=self.setup_model(geometry('Python.Runtime.PyObject'),conversion=True)
        self.assertEqual(repair(plan,doc)['status'],'no_eligible_change')
        self.assertTrue(final.settings['MarshalOutputs'])
    def test_stale_document_cannot_be_modified(self):
        final,_,doc=self.setup_model(geometry('Python.Runtime.PyObject'))
        with self.assertRaises(ValueError):repair(dict(plan,expectedDocumentId='other-document'),doc)
        self.assertFalse(final.settings['MarshalOutputs'])
    def test_empty_geometry_and_preview_fail_independently(self):
        _,output,doc=self.setup_model(preview=False)
        self.assertIn('preview_cache_empty',[i['code'] for i in audit(plan,doc)['issues']])
        output.State.Data.Tree=lambda:NS(ItemCount=0,NonNullItems=[])
        self.assertIn('geometry_output_empty',[i['code'] for i in audit(plan,doc)['issues']])
    def test_invalid_geometry_and_disabled_preview_fail(self):
        _,_,doc=self.setup_model(geometry(valid=False))
        self.assertIn('invalid_geometry',[i['code'] for i in audit(plan,doc)['issues']])
        doc.Display.Enabled=False
        self.assertIn('document_preview_disabled',[i['code'] for i in audit(plan,doc)['issues']])
    def test_final_output_must_belong_to_the_selected_component(self):
        _,_,doc=self.setup_model()
        with self.assertRaises(ValueError):audit(dict(plan,geometryOutputIds=['foreign-output']),doc)
    def test_intentional_intermediate_python_data_is_preserved(self):
        final,_,_=self.setup_model()
        intermediate=component('intermediate',[parameter('raw',[geometry('Python.Runtime.PyObject')])])
        doc=document([intermediate,final])
        selected=dict(plan,componentIds=['intermediate','final'])
        self.assertEqual(audit(selected,doc)['status'],'passed')
        self.assertEqual(repair(selected,doc)['status'],'no_eligible_change')
        self.assertFalse(intermediate.settings['MarshalOutputs'])
    def test_partial_setting_failure_restores_earlier_component(self):
        first=component('final',[parameter('geometry',[geometry('Python.Runtime.PyObject')])])
        second=component('second',[parameter('other',[geometry('Python.Runtime.PyObject')])]); second.fail_setting=True
        doc=document([first,second])
        with self.assertRaises(RuntimeError):repair(dict(plan,componentIds=['final','second'],geometryOutputIds=['geometry','other']),doc)
        self.assertFalse(first.settings['MarshalOutputs'])
    def test_connected_input_with_populated_source_is_not_ignored(self):
        final,_,_=self.setup_model()
        source=component('source',[parameter('source-output',[geometry()])])
        empty=parameter('input',[]); empty.Inputs.Forwards=['source-output']; final.Parameters.Inputs=[empty]
        doc=document([final,source])
        self.assertIn('connected_input_empty',[i['code'] for i in audit(plan,doc)['issues']])
    def test_stale_completed_data_does_not_pass_an_unsolved_component(self):
        final,_,doc=self.setup_model(); final.Phase='Expired'
        self.assertIn('component_not_solved',[i['code'] for i in audit(plan,doc)['issues']])
    def test_large_outputs_have_no_artificial_item_count_quota(self):
        _,output,doc=self.setup_model()
        values=[geometry('Rhino.Geometry.Point3d')]*10001
        output.State.Data.Tree=lambda:NS(ItemCount=len(values),NonNullItems=values)
        self.assertEqual(audit(plan,doc)['status'],'passed')
    def test_null_or_non_geometry_items_cannot_hide_behind_one_valid_geometry(self):
        _,output,doc=self.setup_model()
        values=[geometry(),geometry('System.String')]
        output.State.Data.Tree=lambda:NS(ItemCount=3,NonNullItems=values)
        codes=[i['code'] for i in audit(plan,doc)['issues']]
        self.assertIn('geometry_output_nulls',codes);self.assertIn('non_geometry_output_items',codes)

if __name__=='__main__':
    result=unittest.TextTestRunner().run(unittest.defaultTestLoader.loadTestsFromTestCase(AuditTests))
    print(json.dumps({'passed':result.testsRun,'failures':len(result.failures),'errors':len(result.errors)}))
    raise SystemExit(not result.wasSuccessful())
